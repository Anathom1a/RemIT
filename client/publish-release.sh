#!/usr/bin/env bash
# Загружает собранные файлы клиента на сайт и публикует выпуск.
#
#   export REMIT_SERVICE_TOKEN=...
#   bash client/publish-release.sh --version 1.4.2 \
#       --file windows:x86_64:dist/RemIT-1.4.2-x86_64.exe \
#       --file macos:aarch64:dist/RemIT-1.4.2.dmg \
#       --file linux:x86_64:dist/remit_1.4.2_amd64.deb \
#       --notes dist/notes.txt
#
# После публикации клиенты увидят обновление при следующем запуске.

set -Eeuo pipefail

SITE="${REMIT_SITE:-https://remit.su}"
TOKEN="${REMIT_SERVICE_TOKEN:-}"
VERSION=""
CHANNEL="stable"
NOTES_FILE=""
MANDATORY="false"
PUBLISHED="true"
FILES=()

usage() {
    cat <<USAGE
Использование: bash client/publish-release.sh --version <версия> --file <ос:арх:путь> [ещё --file ...]

  --version    версия выпуска, например 1.4.2 (обязательно)
  --file       файл сборки в виде ос:архитектура:путь; можно указывать несколько раз
               ос: windows | macos | linux | android | ios
  --site       адрес сайта, по умолчанию ${SITE}
  --channel    stable или beta, по умолчанию stable
  --notes      файл с описанием изменений, одна строка — один пункт
  --mandatory  пометить обновление обязательным
  --draft      сохранить черновиком, не публикуя

Токен берётся из REMIT_SERVICE_TOKEN.
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version) VERSION="$2"; shift 2 ;;
        --file) FILES+=("$2"); shift 2 ;;
        --site) SITE="$2"; shift 2 ;;
        --channel) CHANNEL="$2"; shift 2 ;;
        --notes) NOTES_FILE="$2"; shift 2 ;;
        --mandatory) MANDATORY="true"; shift ;;
        --draft) PUBLISHED="false"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Неизвестный параметр: $1" >&2; usage; exit 1 ;;
    esac
done

[[ -n "$VERSION" ]] || { echo "Не указан --version" >&2; usage; exit 1; }
[[ ${#FILES[@]} -gt 0 ]] || { echo "Не указан ни один --file" >&2; usage; exit 1; }
[[ -n "$TOKEN" ]] || { echo "Не задан REMIT_SERVICE_TOKEN" >&2; exit 1; }
command -v curl >/dev/null || { echo "Нужен curl" >&2; exit 1; }
command -v python3 >/dev/null || { echo "Нужен python3" >&2; exit 1; }

SITE="${SITE%/}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------- 1. Загрузка файлов ----------
: > "${WORK}/files.jsonl"
for entry in "${FILES[@]}"; do
    os="${entry%%:*}"
    rest="${entry#*:}"
    arch="${rest%%:*}"
    path="${rest#*:}"

    [[ -f "$path" ]] || { echo "Файл не найден: ${path}" >&2; exit 1; }

    name="$(basename "$path")"
    size="$(wc -c < "$path" | tr -d ' ')"
    echo "==> Загружаю ${name} (${os}/${arch}, ${size} байт)"

    response="$(curl -sS -X PUT \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/octet-stream" \
        --data-binary "@${path}" \
        "${SITE}/api/v1/admin/releases/upload?version=${VERSION}&name=${name}")"

    OS="$os" ARCH="$arch" python3 - "$response" >> "${WORK}/files.jsonl" <<'PY'
import json
import os
import sys

try:
    data = json.loads(sys.argv[1])
except json.JSONDecodeError:
    raise SystemExit(f'Сервер ответил не JSON: {sys.argv[1][:200]}')

if not data.get('ok'):
    raise SystemExit(f"Загрузка не удалась: {data.get('error', data)}")

print(json.dumps({
    'os': os.environ['OS'],
    'arch': os.environ['ARCH'],
    'url': data['url'],
    'sha256': data.get('sha256', ''),
    'size': data.get('size', 0),
}, ensure_ascii=False))
PY
    echo "    готово: $(tail -n 1 "${WORK}/files.jsonl" | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])')"
done

# ---------- 2. Публикация выпуска ----------
NOTES=""
if [[ -n "$NOTES_FILE" ]]; then
    [[ -f "$NOTES_FILE" ]] || { echo "Файл с описанием не найден: ${NOTES_FILE}" >&2; exit 1; }
    NOTES="$(cat "$NOTES_FILE")"
fi

VERSION="$VERSION" CHANNEL="$CHANNEL" NOTES="$NOTES" MANDATORY="$MANDATORY" PUBLISHED="$PUBLISHED" \
    python3 - "${WORK}/files.jsonl" > "${WORK}/release.json" <<'PY'
import json
import os
import sys

files = [json.loads(line) for line in open(sys.argv[1], encoding='utf-8') if line.strip()]
print(json.dumps({
    'version': os.environ['VERSION'],
    'channel': os.environ['CHANNEL'],
    'notes': os.environ['NOTES'],
    'mandatory': os.environ['MANDATORY'] == 'true',
    'published': os.environ['PUBLISHED'] == 'true',
    'files': files,
}, ensure_ascii=False))
PY

echo "==> Публикую выпуск ${VERSION} (${CHANNEL})"
result="$(curl -sS -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "@${WORK}/release.json" \
    "${SITE}/api/v1/admin/releases")"

SITE="$SITE" python3 - "$result" <<'PY'
import json
import os
import sys

try:
    data = json.loads(sys.argv[1])
except json.JSONDecodeError:
    raise SystemExit(f'Сервер ответил не JSON: {sys.argv[1][:200]}')

if not data.get('ok'):
    raise SystemExit(f"Публикация не удалась: {data.get('error', data)}")

release = data['release']
site = os.environ['SITE']
state = 'опубликован' if release['published'] else 'сохранён черновиком'
print()
print('============================================================')
print(f"  Выпуск {release['version']} {state}")
print(f"  Страница: {site}/obnovlenie/{release['version']}")
for item in release['files']:
    print(f"  {item['os']}/{item['arch']}: {site}{item['url']}")
print()
print('  Клиенты увидят обновление при следующем запуске.')
print('============================================================')
PY
