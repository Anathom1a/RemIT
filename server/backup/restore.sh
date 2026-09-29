#!/usr/bin/env bash
# Восстановление RemIT из резервной копии.
#
#   sudo bash server/backup/restore.sh remit-20260929-033000.tar.enc
#
# Файл ищется в server/backups; если его там нет — скачивается из внешнего
# хранилища (настройки BACKUP_S3_* из server/.env). Скрипт:
#   1. проверяет копию (расшифровка, контрольные суммы, пробное развёртывание);
#   2. останавливает сайт и hbbs/hbbr;
#   3. заменяет базу содержимым копии, возвращает ключ сервера и вложения;
#   4. запускает всё обратно.
# Текущие данные перед заменой сохраняются в server/backups/before-restore-*.

set -Eeuo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SERVER_DIR}/.env"
NAME="${1:-}"

fail() { echo "ОШИБКА: $*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail "запустите через sudo"
[[ -n "$NAME" ]] || fail "укажите файл копии, например remit-20260929-033000.tar.enc (ls ${SERVER_DIR}/backups)"
NAME="$(basename "$NAME")"
[[ -f "$ENV_FILE" ]] || fail "нет ${ENV_FILE}"
cd "$SERVER_DIR"
compose() { docker compose --env-file "$ENV_FILE" "$@"; }

if [[ ! -f "backups/${NAME}" ]]; then
    echo "==> Копии нет на сервере — скачиваю из внешнего хранилища"
    compose run --rm backup fetch "$NAME"
fi

echo "==> Проверяю копию"
compose run --rm backup verify "/backups/${NAME}"

read -rp "Заменить текущие данные содержимым ${NAME}? Введите «да»: " answer
[[ "$answer" == "да" ]] || fail "отменено"

STAMP="$(date +%Y%m%d-%H%M%S)"
echo "==> Сохраняю текущее состояние в backups/before-restore-${STAMP}"
mkdir -p "backups/before-restore-${STAMP}"
compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/before-restore-${STAMP}/db.dump" || true
cp -a data/rustdesk "backups/before-restore-${STAMP}/rustdesk" 2>/dev/null || true

echo "==> Останавливаю сайт и сервер"
compose stop web rustdesk watchdog || true

echo "==> Разворачиваю копию"
compose run --rm --entrypoint sh \
    -v "${SERVER_DIR}/data:/restore-data" \
    backup -c '
set -eu
work=$(mktemp -d)
case "$1" in
  *.enc) openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "/backups/$1" -out "$work/a.tar" ;;
  *) cp "/backups/$1" "$work/a.tar" ;;
esac
tar -xf "$work/a.tar" -C "$work"
# База: схема пересоздаётся целиком, как в момент копии.
psql -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore --no-owner --no-privileges -d "$PGDATABASE" "$work/db.dump"
# Ключ сервера и данные hbbs.
rm -rf /restore-data/rustdesk && cp -a "$work/data/rustdesk" /restore-data/rustdesk
if [ -d "$work/data/attachments" ]; then rm -rf /restore-data/attachments && cp -a "$work/data/attachments" /restore-data/attachments; fi
if [ -d "$work/data/releases" ]; then rm -rf /restore-data/releases && cp -a "$work/data/releases" /restore-data/releases; fi
chown -R 1001:1001 /restore-data/attachments /restore-data/releases 2>/dev/null || true
rm -rf "$work"
' restore "$NAME"

echo "==> Запускаю"
compose up -d

echo
echo "============================================================"
echo "  Восстановлено из ${NAME}."
echo "  Прежнее состояние: server/backups/before-restore-${STAMP}"
echo "  Проверьте сайт, вход в клиенте и страницу /status."
echo "============================================================"
