#!/usr/bin/env bash
# Разворачивает стек RemIT на чистой Ubuntu 22.04/24.04:
# сервер идентификации и ретрансляции, панель, сайт с кабинетом, база данных.
#
#   sudo bash server/deploy.sh
#
# Скрипт не трогает уже существующий .env и не перезаписывает секреты.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

fail() { echo "ОШИБКА: $*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail "запустите через sudo"

# ---------- 1. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
    echo "==> Установка Docker..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
fi
docker compose version >/dev/null 2>&1 || fail "не установлен плагин docker compose"

# ---------- 2. Секреты ----------
if [[ ! -f "$ENV_FILE" ]]; then
    echo "==> Создание ${ENV_FILE} со случайными секретами..."
    read -rp "Домен сайта (например remit.su): " PUBLIC_DOMAIN
    read -rp "Адрес ID-сервера (домен или IP): " PUBLIC_ADDR
    read -rp "Почта администратора (доступ в админку): " ADMIN_EMAIL
    POSTGRES_PASSWORD="$(openssl rand -hex 24)"
    cat > "$ENV_FILE" <<ENVEOF
PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
PUBLIC_ADDR=${PUBLIC_ADDR}
REMIT_ADMIN_EMAILS=${ADMIN_EMAIL}
POSTGRES_DB=remit
POSTGRES_USER=remit
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REMIT_AUTH_SECRET=$(openssl rand -hex 32)
REMIT_SERVICE_TOKEN=$(openssl rand -hex 32)
JWT_KEY=$(openssl rand -hex 32)
REMIT_FREE_SECONDS_PER_DAY=10800
REMIT_BILLING_PROVIDER=yookassa
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
MUST_LOGIN=N
TOKEN_EXPIRE=720h
ENVEOF
    chmod 600 "$ENV_FILE"
else
    echo "==> ${ENV_FILE} уже существует — секреты не трогаем."
fi

# ---------- 3. Каталоги данных ----------
mkdir -p "${SCRIPT_DIR}/data"/{postgres,rustdesk,rustdesk-api,releases,certbot/conf,certbot/www}
# Приложение в контейнере работает под UID 1001 — ему нужно писать сборки.
chown -R 1001:1001 "${SCRIPT_DIR}/data/releases"

# ---------- 4. Запуск ----------
echo "==> Сборка и запуск стека..."
cd "$SCRIPT_DIR"
docker compose --env-file "$ENV_FILE" up -d --build

# ---------- 5. Публичный ключ hbbs ----------
echo "==> Ожидание ключа hbbs..."
KEY_FILE="${SCRIPT_DIR}/data/rustdesk/id_ed25519.pub"
for _ in $(seq 1 30); do
    [[ -s "$KEY_FILE" ]] && break
    sleep 1
done

echo
echo "============================================================"
if [[ -s "$KEY_FILE" ]]; then
    echo "  Публичный ключ сервера:"
    echo "     $(cat "$KEY_FILE")"
    echo "  Добавьте его в .env как RUSTDESK_PUBLIC_KEY и пересоздайте web:"
    echo "     docker compose --env-file .env up -d web"
else
    echo "  Ключ hbbs пока не создан. Проверьте: docker compose logs rustdesk"
fi
echo
echo "  Сайт и кабинет:  https://$(grep '^PUBLIC_DOMAIN=' "$ENV_FILE" | cut -d= -f2)"
echo "  Панель RustDesk: /_admin/"
echo "  Настройте TLS (certbot) и проверьте docs/DEPLOY.md."
echo "============================================================"
