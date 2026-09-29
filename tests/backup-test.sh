#!/usr/bin/env bash
# Проверка резервного копирования (server/backup): копия снимается, шифруется,
# проверяется восстановлением, уходит в S3; сбои ловятся; восстановление
# возвращает базу, ключ сервера и вложения.
#
#   TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:5432/postgres bash tests/backup-test.sh
#
# Нужны клиент и сервер Postgres той же версии, что в стеке (pg_dump, initdb):
# PG_BIN — каталог с ними (по умолчанию /usr/lib/postgresql/16/bin).

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/server/backup/backup.sh"
WORK="$(mktemp -d)"
export PATH="${PG_BIN:-/usr/lib/postgresql/16/bin}:$PATH"
chmod 755 "$WORK"
pass=0; failed=0
ok() { echo "  ✓ $1"; pass=$((pass + 1)); }
bad() { echo "  ✗ $1"; failed=$((failed + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

# База-источник со схемой сайта и данными.
url="${TEST_DATABASE_URL:?нужен TEST_DATABASE_URL}"
psql "$url" -qc 'DROP DATABASE IF EXISTS remit_backup_test WITH (FORCE)' -c 'CREATE DATABASE remit_backup_test' >/dev/null
db="${url%/*}/remit_backup_test"
psql "$db" -q -f "$ROOT/server/sql/001_init.sql" >/dev/null
for i in 1 2 3 4 5; do
    psql "$db" -qc "INSERT INTO users (id, email, name, password_hash) VALUES ('usr_$i', 'u$i@example.com', 'U$i', 'x')" >/dev/null
done
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
PGHOST=$(node -e "console.log(new URL('$db').hostname)"); PGPORT=$(node -e "console.log(new URL('$db').port || 5432)")
PGUSER=$(node -e "console.log(new URL('$db').username)"); PGPASSWORD=$(node -e "console.log(decodeURIComponent(new URL('$db').password))")
PGDATABASE=remit_backup_test

# Данные сервера и заглушка S3 с приёмом отчёта.
mkdir -p "$WORK/data/rustdesk" "$WORK/data/attachments/t1" "$WORK/out"
openssl rand -base64 64 > "$WORK/data/rustdesk/id_ed25519"
openssl rand -base64 32 > "$WORK/data/rustdesk/id_ed25519.pub"
echo shot > "$WORK/data/attachments/t1/a.png"
PORT=21995 node "$ROOT/tests/fakes/s3.mjs" & S3=$!
trap 'kill $S3 2>/dev/null; rm -rf "$WORK"' EXIT
sleep 1
export BACKUP_DIR="$WORK/out" BACKUP_DATA_DIR="$WORK/data" BACKUP_PASSPHRASE='correct horse battery'
export BACKUP_S3_ENDPOINT=http://127.0.0.1:21995 BACKUP_S3_BUCKET=remit-backups BACKUP_S3_ACCESS_KEY=AK123 BACKUP_S3_SECRET_KEY=SK456
export BACKUP_REPORT_URL=http://127.0.0.1:21995/report REMIT_SERVICE_TOKEN=tok
log() { curl -s http://127.0.0.1:21995/__log; }

echo "Копия"
check "копия снята и проверена" 'sh "$SCRIPT" run > "$WORK/run.log" 2>&1'
file=$(ls "$WORK/out" | grep '\.tar\.enc$' | head -1)
check "архив зашифрован" '[ -n "$file" ] && ! tar -tf "$WORK/out/$file" >/dev/null 2>&1'
check "в S3 с подписью SigV4" 'log | grep -q "\"signed\":true"'
check "сайт получил отчёт об успехе" 'log | grep -q "\"ok\":true,\"file\":\"$file\"" && log | grep -q "\"remote\":true"'
check "в журнале — число пользователей" 'grep -q "пользователей 5" "$WORK/run.log"'

echo "Сбои"
check "неверный пароль — копия не открывается" '! BACKUP_PASSPHRASE=wrong sh "$SCRIPT" verify "$WORK/out/$file" >/dev/null 2>&1'
cp "$WORK/out/$file" "$WORK/bad.tar.enc"
printf 'XXXX' | dd of="$WORK/bad.tar.enc" bs=1 seek=2000 conv=notrunc 2>/dev/null
check "повреждённый архив не проходит проверку" '! sh "$SCRIPT" verify "$WORK/bad.tar.enc" >/dev/null 2>&1'
check "без ключа сервера — сбой" '! BACKUP_DATA_DIR="$WORK/nodata" sh "$SCRIPT" run >/dev/null 2>&1'
check "о сбое сайт узнал" 'log | grep -q "с ключом сервера"'
check "без пароля в S3 не отправляем" '! BACKUP_PASSPHRASE= sh "$SCRIPT" run >/dev/null 2>&1'
check "и незашифрованный архив не остался" '[ -z "$(ls "$WORK/out" | grep "\.tar$")" ]'

echo "Скачивание и восстановление"
mkdir -p "$WORK/out2"
check "копия скачивается из S3 без изменений" 'BACKUP_DIR="$WORK/out2" sh "$SCRIPT" fetch "$file" >/dev/null && cmp -s "$WORK/out/$file" "$WORK/out2/$file"'
psql -qc "DELETE FROM users WHERE id IN ('usr_4', 'usr_5')" >/dev/null
mkdir -p "$WORK/restore-data/rustdesk"; echo broken > "$WORK/restore-data/rustdesk/id_ed25519"
inner=$(python3 -c "
import re,sys
s=open('$ROOT/server/backup/restore.sh').read()
print(re.search(r\"backup -c '\n(.*?)\n' restore\", s, re.S).group(1).replace('/backups/','$WORK/out/').replace('/restore-data','$WORK/restore-data'))")
check "восстановление отработало" 'sh -c "$inner" restore "$file" > "$WORK/restore.log" 2>&1'
check "база вернулась" '[ "$(psql -tAc "SELECT count(*) FROM users")" = "5" ]'
check "ключ сервера вернулся" 'cmp -s "$WORK/restore-data/rustdesk/id_ed25519" "$WORK/data/rustdesk/id_ed25519"'
check "вложения вернулись" '[ -f "$WORK/restore-data/attachments/t1/a.png" ]'

echo
if [ "$failed" -gt 0 ]; then
    echo "$pass прошли, $failed упали"; cat "$WORK/run.log"; exit 1
fi
echo "Все проверки прошли: $pass"
