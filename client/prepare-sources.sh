#!/usr/bin/env bash
# Готовит исходники фирменного клиента: забирает нужную версию RustDesk,
# накатывает наши правки и раскладывает иконки.
#
#   bash client/prepare-sources.sh --tag 1.4.2 --out ~/build/remit-client
#
# После этого в каталоге --out лежит обычное дерево исходников RustDesk с
# нашими правками: собирайте его по docs/BUILD-CLIENT.md.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TAG=""
OUT=""
SITE="https://remit.su"
APP_NAME="RemIT"
ID_SERVER="remit.su"
RELAY_SERVER="remit.su"
PUBLIC_KEY="${REMIT_PUBLIC_KEY:-0rexVZoXqaUjnIooWsmVscaVgkfLuxlpY7LN73X4UA0=}"
BRAND_DIR="${REPO_ROOT}/client/brand"

usage() {
    cat <<USAGE
Использование: bash client/prepare-sources.sh --tag <версия RustDesk> --out <каталог> [опции]

  --tag           тег исходников RustDesk, например 1.4.2 (обязательно)
  --out           куда положить подготовленные исходники (обязательно)
  --site          адрес сайта и API, по умолчанию ${SITE}
  --app-name      название продукта, по умолчанию ${APP_NAME}
  --id-server     адрес сервера идентификации, по умолчанию ${ID_SERVER}
  --relay-server  адрес ретранслятора, по умолчанию ${RELAY_SERVER}
  --public-key    открытый ключ сервера; иначе берётся из REMIT_PUBLIC_KEY
  --brand-dir     каталог с иконками и логотипами, по умолчанию client/brand
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --tag) TAG="$2"; shift 2 ;;
        --out) OUT="$2"; shift 2 ;;
        --site) SITE="$2"; shift 2 ;;
        --app-name) APP_NAME="$2"; shift 2 ;;
        --id-server) ID_SERVER="$2"; shift 2 ;;
        --relay-server) RELAY_SERVER="$2"; shift 2 ;;
        --public-key) PUBLIC_KEY="$2"; shift 2 ;;
        --brand-dir) BRAND_DIR="$2"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Неизвестный параметр: $1" >&2; usage; exit 1 ;;
    esac
done

[[ -n "$TAG" ]] || { echo "Не указан --tag" >&2; usage; exit 1; }
[[ -n "$OUT" ]] || { echo "Не указан --out" >&2; usage; exit 1; }
[[ -n "$PUBLIC_KEY" ]] || {
    echo "Не задан открытый ключ сервера: --public-key или REMIT_PUBLIC_KEY." >&2
    echo "Он лежит на сервере: /opt/remit/server/data/rustdesk/id_ed25519.pub" >&2
    exit 1
}

command -v git >/dev/null || { echo "Нужен git" >&2; exit 1; }
command -v python3 >/dev/null || { echo "Нужен python3" >&2; exit 1; }

# ---------- 1. Исходники ----------
if [[ -d "$OUT/.git" ]]; then
    echo "==> Обновляю существующий каталог ${OUT} до ${TAG}"
    git -C "$OUT" fetch --tags --depth 1 origin "refs/tags/${TAG}:refs/tags/${TAG}"
    git -C "$OUT" checkout -f "tags/${TAG}"
    git -C "$OUT" submodule update --init --recursive --depth 1
else
    echo "==> Клонирую RustDesk ${TAG} в ${OUT}"
    git clone --depth 1 --branch "$TAG" --recursive https://github.com/rustdesk/rustdesk.git "$OUT"
fi

# ---------- 2. Наши правки ----------
echo "==> Накатываю фирменные правки"
python3 "${REPO_ROOT}/client/patches/brand-client.py" "$OUT" \
    --app-name "$APP_NAME" \
    --id-server "$ID_SERVER" \
    --relay-server "$RELAY_SERVER" \
    --api-server "$SITE" \
    --update-url "${SITE%/}/api/version/latest" \
    --public-key "$PUBLIC_KEY" \
    --brand-dir "$BRAND_DIR"

echo
echo "============================================================"
echo "  Исходники готовы: ${OUT}"
echo "  Версия RustDesk:  ${TAG}"
echo "  Сайт и API:       ${SITE}"
echo "  Сервер:           ${ID_SERVER} / ${RELAY_SERVER}"
echo
echo "  Дальше — сборка под нужную систему: docs/BUILD-CLIENT.md"
echo "============================================================"
