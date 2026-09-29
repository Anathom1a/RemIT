#!/bin/sh
# Сторож RemIT: следит за сайтом со стороны. Если сайт лёг, сам он о себе
# уже никому не скажет — скажет сторож.
#
#   - раз в WATCH_INTERVAL секунд запрашивает /api/health;
#   - после WATCH_THRESHOLD провалов подряд шлёт тревогу в Telegram;
#   - когда сайт снова ответил — сообщает об этом и передаёт сайту время
#     простоя (он попадёт в доступность и историю на странице статуса).
#
# Запускается контейнером watchdog из server/docker-compose.yml. Если лёг
# весь сервер, сторож ляжет вместе с ним — для этого нужен внешний
# мониторинг (docs/MONITORING.md).

URL="${WATCH_URL:-http://web:3000/api/health}"
SITE="${WATCH_SITE:-http://web:3000}"
INTERVAL="${WATCH_INTERVAL:-60}"
THRESHOLD="${WATCH_THRESHOLD:-3}"
NAME="${WATCH_NAME:-RemIT}"
TG_API="${TELEGRAM_API_URL:-https://api.telegram.org}"

fails=0
first_fail=""
down_since=""

iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

send() {
    echo "$(date -u +%FT%TZ) $1"
    if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
        return
    fi
    curl -fsS -m 10 "$TG_API/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
        --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
        --data-urlencode "text=$1" >/dev/null || echo "не отправлено в Telegram"
}

report() {
    curl -fsS -m 10 -X POST \
        -H "Authorization: Bearer $SERVICE_TOKEN" \
        -H 'Content-Type: application/json' \
        -d "{\"from\":\"$1\",\"to\":\"$2\"}" \
        "$SITE/api/v1/monitoring/outage" >/dev/null || echo "простой не записан на сайте"
}

echo "$(date -u +%FT%TZ) сторож: $URL каждые ${INTERVAL} с, тревога после $THRESHOLD провалов"
while true; do
    now=$(date +%s)
    if curl -fsS -m 10 -o /dev/null "$URL"; then
        if [ -n "$down_since" ]; then
            minutes=$(( (now - down_since + 59) / 60 ))
            send "🟢 $NAME: сайт снова отвечает, простой около $minutes мин"
            report "$(iso "$down_since")" "$(iso "$now")"
            down_since=""
        fi
        fails=0
    else
        fails=$((fails + 1))
        [ "$fails" -eq 1 ] && first_fail=$now
        if [ "$fails" -eq "$THRESHOLD" ]; then
            down_since=$first_fail
            send "🔴 $NAME: сайт не отвечает ($THRESHOLD проверки подряд). Сервер ID и ретрансляторы могут работать — проверьте контейнер web."
        fi
    fi
    sleep "$INTERVAL"
done
