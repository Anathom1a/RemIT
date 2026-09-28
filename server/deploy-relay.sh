#!/usr/bin/env bash
# Разворачивает отдельный ретранслятор RemIT (hbbr) на чистой Ubuntu 22.04/24.04.
#
# Сначала добавьте узел в админке сайта («Ретрансляторы» → «Добавить»): она
# покажет готовую команду с ключом и токеном. Затем на новой машине:
#
#   sudo bash server/deploy-relay.sh --domain relay1.remit.su \
#       --key '<открытый ключ сервера>' --token <токен узла>
#
# Доменное имя должно уже указывать на эту машину: на него выпускается
# сертификат для веб-клиента. Повторный запуск безопасен — обновит настройки
# и перезапустит узел.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_DIR="${SCRIPT_DIR}/relay"
ENV_FILE="${RELAY_DIR}/.env"

DOMAIN=""
KEY=""
TOKEN=""
PORT=21117
IMAGE=""
EMAIL=""

fail() { echo "ОШИБКА: $*" >&2; exit 1; }

usage() {
    cat <<USAGE
Использование: sudo bash server/deploy-relay.sh --domain <имя> --key <ключ> --token <токен> [опции]

  --domain  имя узла, например relay1.remit.su (A-запись на эту машину)
  --key     открытый ключ основного сервера (RUSTDESK_PUBLIC_KEY)
  --token   токен команд узла из админки
  --port    порт ретранслятора, по умолчанию 21117 (веб-клиент — порт + 2)
  --image   образ сервера, по умолчанию ghcr.io/anathom1a/rustdesk-server-s6-remit:latest
  --email   почта для Let's Encrypt (напоминания об истечении сертификата)
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --key) KEY="$2"; shift 2 ;;
        --token) TOKEN="$2"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        --image) IMAGE="$2"; shift 2 ;;
        --email) EMAIL="$2"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) usage; fail "неизвестный параметр: $1" ;;
    esac
done

[[ $EUID -eq 0 ]] || fail "запустите через sudo"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$DOMAIN" == *.* ]] || fail "укажите --domain, например relay1.remit.su"
[[ -n "$KEY" ]] || fail "укажите --key: открытый ключ основного сервера"
[[ "$TOKEN" =~ ^[0-9a-f]{32,}$ ]] || fail "укажите --token из админки"
[[ "$PORT" =~ ^[0-9]+$ && "$PORT" -ge 1 && "$PORT" -le 65533 ]] || fail "некорректный --port"
WS_PORT=$((PORT + 2))

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

# ---------- 2. Настройки узла ----------
echo "==> Запись ${ENV_FILE}"
umask 077
{
    echo "RELAY_DOMAIN=${DOMAIN}"
    echo "RELAY_PORT=${PORT}"
    echo "RELAY_WS_PORT=${WS_PORT}"
    echo "REMIT_PUBLIC_KEY=${KEY}"
    echo "REMIT_RELAY_TOKEN=${TOKEN}"
    [[ -n "$IMAGE" ]] && echo "RUSTDESK_IMAGE=${IMAGE}"
    # Ограничения скорости переносим из прежнего файла, если были.
    if [[ -f "$ENV_FILE" ]]; then
        grep -E '^(TOTAL_BANDWIDTH|SINGLE_BANDWIDTH|LIMIT_SPEED)=' "$ENV_FILE" || true
        [[ -z "$IMAGE" ]] && grep -E '^RUSTDESK_IMAGE=' "$ENV_FILE" || true
    fi
} > "${ENV_FILE}.new"
mv "${ENV_FILE}.new" "$ENV_FILE"
umask 022

mkdir -p "${RELAY_DIR}/data/certbot/conf" "${RELAY_DIR}/data/certbot/www"

# ---------- 3. Брандмауэр ----------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    echo "==> Открываю порты в ufw"
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw allow "${PORT}/tcp" >/dev/null
    ufw allow "${WS_PORT}/tcp" >/dev/null
fi

# ---------- 4. Сертификат ----------
cd "$RELAY_DIR"
if [[ ! -s "data/certbot/conf/live/${DOMAIN}/fullchain.pem" ]]; then
    echo "==> Выпуск сертификата для ${DOMAIN}"
    # nginx ещё не запущен (или останавливаем его): certbot сам слушает порт 80.
    docker compose --env-file "$ENV_FILE" stop nginx >/dev/null 2>&1 || true
    if [[ -n "$EMAIL" ]]; then
        CONTACT=(-m "$EMAIL")
    else
        CONTACT=(--register-unsafely-without-email)
    fi
    docker run --rm -p 80:80 \
        -v "${RELAY_DIR}/data/certbot/conf:/etc/letsencrypt" \
        certbot/certbot certonly --standalone --non-interactive --agree-tos \
        "${CONTACT[@]}" -d "$DOMAIN" \
        || fail "сертификат не выпущен: проверьте, что ${DOMAIN} указывает на эту машину и порт 80 открыт"
fi

# Продление: certbot проверяет сертификат дважды в сутки и обновляет его
# через nginx (webroot), после чего nginx перечитывает сертификат.
cat > /etc/cron.d/remit-relay-certbot <<CRON
# Продление сертификата ретранслятора RemIT (server/deploy-relay.sh).
17 3,15 * * * root docker run --rm -v ${RELAY_DIR}/data/certbot/conf:/etc/letsencrypt -v ${RELAY_DIR}/data/certbot/www:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot --quiet && docker exec remit-relay-nginx nginx -s reload >/dev/null 2>&1
CRON
chmod 644 /etc/cron.d/remit-relay-certbot

# ---------- 5. Запуск ----------
echo "==> Запуск ретранслятора"
docker compose --env-file "$ENV_FILE" pull -q || fail "образ не скачан. Приватный пакет GHCR: docker login ghcr.io"
docker compose --env-file "$ENV_FILE" up -d

echo "==> Проверка"
ok=0
for _ in $(seq 1 15); do
    if (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then ok=1; break; fi
    sleep 1
done

echo
echo "============================================================"
if [[ "$ok" == "1" ]]; then
    echo "  Ретранслятор запущен: ${DOMAIN}:${PORT}"
    echo "  Веб-клиент:           wss://${DOMAIN}:${WS_PORT}"
    echo
    echo "  Откройте админку сайта → «Ретрансляторы»: у узла должны"
    echo "  загореться зелёные отметки. Затем нажмите «Включить»."
else
    echo "  hbbr не отвечает на порту ${PORT}. Журнал:"
    echo "     docker compose -f ${RELAY_DIR}/docker-compose.yml logs hbbr"
fi
echo "============================================================"
