#!/bin/sh
# Резервные копии RemIT. Работает в контейнере backup (server/docker-compose.yml).
#
#   remit-backup loop           раз в сутки в BACKUP_TIME (и сразу при старте)
#   remit-backup run            одна копия сейчас: снять, проверить, отправить
#   remit-backup verify ФАЙЛ    проверить архив: расшифровать, развернуть базу
#                               во временном Postgres, сверить содержимое
#
# В архиве: дамп базы (pg_dump -Fc), каталог hbbs с ключом сервера
# (id_ed25519 — без него все клиенты перестанут подключаться), вложения
# обращений и, если BACKUP_RELEASES=true, загруженные сборки клиента.
# Архив шифруется BACKUP_PASSPHRASE (AES-256, PBKDF2) и уходит в
# S3-совместимое хранилище, если оно настроено. Итог каждой копии сайт
# получает в мониторинг: нет свежей проверенной копии — будет тревога.

set -eu

OUT="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
TIME="${BACKUP_TIME:-03:30}"
DATA="${BACKUP_DATA_DIR:-/data}"
SITE="${BACKUP_REPORT_URL:-http://web:3000/api/v1/monitoring/backup}"

log() { echo "$(date '+%F %T') $*"; }
fail() { log "ОШИБКА: $*"; report false "" 0 "$*"; exit 1; }

# Итог копии — в мониторинг сайта.
report() {
    ok="$1"; file="$2"; size="$3"; error="$4"
    [ -n "${REMIT_SERVICE_TOKEN:-}" ] || return 0
    body=$(printf '{"ok":%s,"file":"%s","size":%s,"remote":%s,"error":"%s"}' \
        "$ok" "$file" "$size" "${REMOTE_OK:-false}" "$(printf '%s' "$error" | tr '"\n' "' ")")
    curl -fsS -m 15 -X POST -H "Authorization: Bearer $REMIT_SERVICE_TOKEN" \
        -H 'Content-Type: application/json' -d "$body" "$SITE" >/dev/null 2>&1 \
        || log "итог не передан сайту"
}

# Временный Postgres нельзя запускать от root: под root — от пользователя
# postgres (в контейнере su-exec, на обычной машине runuser), иначе — как есть.
as_postgres() {
    if [ "$(id -u)" != "0" ]; then "$@"
    elif command -v su-exec >/dev/null 2>&1; then su-exec postgres "$@"
    else runuser -u postgres -- "$@"
    fi
}

encrypt() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$1" -out "$2"; }
decrypt() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$1" -out "$2"; }

s3_enabled() { [ -n "${BACKUP_S3_BUCKET:-}" ] && [ -n "${BACKUP_S3_ACCESS_KEY:-}" ] && [ -n "${BACKUP_S3_SECRET_KEY:-}" ]; }

s3_url() {
    endpoint="${BACKUP_S3_ENDPOINT:-https://storage.yandexcloud.net}"
    echo "${endpoint%/}/${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-remit}/$1"
}

s3_put() {
    curl -fsS -m 1800 --aws-sigv4 "aws:amz:${BACKUP_S3_REGION:-ru-central1}:s3" \
        --user "${BACKUP_S3_ACCESS_KEY}:${BACKUP_S3_SECRET_KEY}" \
        -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" \
        -T "$1" "$(s3_url "$2")" >/dev/null
}

s3_get() {
    curl -fsS -m 1800 --aws-sigv4 "aws:amz:${BACKUP_S3_REGION:-ru-central1}:s3" \
        --user "${BACKUP_S3_ACCESS_KEY}:${BACKUP_S3_SECRET_KEY}" \
        -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" \
        -o "$2" "$(s3_url "$1")"
}

# Проверка архива: всё ли на месте и разворачивается ли база.
verify() {
    archive="$1"
    work=$(mktemp -d)
    trap 'rm -rf "$work"' EXIT
    case "$archive" in
        *.enc)
            [ -n "${BACKUP_PASSPHRASE:-}" ] || { log "нужен BACKUP_PASSPHRASE"; return 1; }
            decrypt "$archive" "$work/archive.tar" || { log "не расшифровать (неверный пароль?)"; return 1; }
            ;;
        *) cp "$archive" "$work/archive.tar" ;;
    esac
    tar -xf "$work/archive.tar" -C "$work" || { log "архив повреждён"; return 1; }
    ( cd "$work" && sha256sum -c SHA256SUMS >/dev/null ) || { log "контрольные суммы не сходятся"; return 1; }
    [ -s "$work/data/rustdesk/id_ed25519" ] && [ -s "$work/data/rustdesk/id_ed25519.pub" ] \
        || { log "в архиве нет ключа сервера"; return 1; }

    # Временный Postgres внутри контейнера: развернуть дамп целиком.
    pgdata="$work/pg"
    mkdir -p "$pgdata"
    [ "$(id -u)" = "0" ] && chown postgres "$work" "$pgdata"
    as_postgres initdb -D "$pgdata" -U postgres --auth=trust >/dev/null
    as_postgres pg_ctl -D "$pgdata" -o "-p 55439 -k $work -c listen_addresses=''" -w start >/dev/null
    status=0
    if PGHOST="$work" PGPORT=55439 PGUSER=postgres createdb check \
        && PGHOST="$work" PGPORT=55439 PGUSER=postgres pg_restore --no-owner --no-privileges -d check "$work/db.dump" >/dev/null 2>"$work/restore.log"; then
        users=$(PGHOST="$work" PGPORT=55439 PGUSER=postgres psql -tAc 'SELECT count(*) FROM users' check)
        expected=$(cat "$work/COUNTS" 2>/dev/null | sed -n 's/^users=//p')
        if [ -n "$expected" ] && [ "$users" != "$expected" ]; then
            log "в развёрнутой базе $users пользователей, а при снятии было $expected"
            status=1
        else
            log "проверка: база развёрнута, пользователей $users, ключ сервера на месте"
        fi
    else
        log "база не разворачивается: $(tail -3 "$work/restore.log")"
        status=1
    fi
    as_postgres pg_ctl -D "$pgdata" -m immediate stop >/dev/null 2>&1 || true
    return $status
}

run() {
    [ -n "${PGHOST:-}" ] || fail "не задан PGHOST"
    if s3_enabled && [ -z "${BACKUP_PASSPHRASE:-}" ]; then
        fail "BACKUP_PASSPHRASE не задан: без шифрования во внешнее хранилище не отправляем"
    fi
    stamp=$(date +%Y%m%d-%H%M%S)
    work=$(mktemp -d)
    trap 'rm -rf "$work"' EXIT
    mkdir -p "$OUT"

    log "снимаю базу"
    pg_dump -Fc -f "$work/db.dump" || fail "pg_dump не сработал"
    echo "users=$(psql -tAc 'SELECT count(*) FROM users')" > "$work/COUNTS"

    log "копирую данные"
    mkdir -p "$work/data"
    [ -d "$DATA/rustdesk" ] || fail "нет каталога $DATA/rustdesk с ключом сервера"
    cp -a "$DATA/rustdesk" "$work/data/rustdesk"
    [ -d "$DATA/attachments" ] && cp -a "$DATA/attachments" "$work/data/attachments"
    if [ "${BACKUP_RELEASES:-false}" = "true" ] && [ -d "$DATA/releases" ]; then
        cp -a "$DATA/releases" "$work/data/releases"
    fi
    ( cd "$work" && find db.dump COUNTS data -type f -exec sha256sum {} + > SHA256SUMS )

    name="remit-$stamp.tar"
    tar -cf "$OUT/$name" -C "$work" db.dump COUNTS SHA256SUMS data
    if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
        encrypt "$OUT/$name" "$OUT/$name.enc" && rm -f "$OUT/$name"
        name="$name.enc"
    fi
    chmod 600 "$OUT/$name"
    size=$(wc -c < "$OUT/$name" | tr -d ' ')

    log "проверяю восстановление"
    ( verify "$OUT/$name" ) || fail "копия $name не прошла проверку восстановления"

    REMOTE_OK=false
    if s3_enabled; then
        log "отправляю в $(s3_url "$name")"
        if s3_put "$OUT/$name" "$name"; then REMOTE_OK=true; else fail "не удалось отправить копию во внешнее хранилище"; fi
    else
        log "внешнее хранилище не настроено — копия только на этом сервере"
    fi

    find "$OUT" -name 'remit-*.tar*' -mtime +"$KEEP_DAYS" -delete
    log "готово: $name, $(( size / 1024 )) КБ"
    report true "$name" "$size" ""
}

loop() {
    log "резервные копии: каждый день в $TIME, храним $KEEP_DAYS дней"
    ( run ) || true
    while true; do
        now=$(date +%s)
        next=$(date -d "$(date +%F) $TIME" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M' -d "$(date +%F) $TIME" +%s)
        [ "$next" -le "$now" ] && next=$((next + 86400))
        sleep $((next - now))
        ( run ) || true
    done
}

case "${1:-loop}" in
    loop) loop ;;
    run) run ;;
    verify) [ -n "${2:-}" ] || { echo "verify ФАЙЛ"; exit 2; }; verify "$2" ;;
    fetch) [ -n "${2:-}" ] || { echo "fetch ИМЯ"; exit 2; }; s3_get "$2" "$OUT/$2" && log "скачано: $OUT/$2" ;;
    *) echo "remit-backup loop|run|verify ФАЙЛ|fetch ИМЯ"; exit 2 ;;
esac
