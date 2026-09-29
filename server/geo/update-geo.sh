#!/bin/sh
# База GeoIP для выбора ближайшего ретранслятора (патч relay-geo-hook).
#
# Скачивает DB-IP IP to City Lite (CC BY 4.0, обновляется раз в месяц),
# оставляет только IPv4, округляет координаты до 0,1° (~10 км) и склеивает
# соседние диапазоны с одинаковыми координатами. Итог — geo.csv в каталоге
# данных hbbs: «начало,конец,широта,долгота», адреса числами. hbbs сам
# перечитывает файл, когда он меняется.
#
#   update-geo.sh           — работать постоянно: проверять раз в сутки,
#                             обновлять, если файлу больше GEO_MAX_AGE_DAYS дней;
#   update-geo.sh --once    — обновить один раз и выйти;
#   GEO_SOURCE=file.csv.gz  — взять готовый файл вместо скачивания.
set -eu

OUT="${GEO_FILE:-/data/rustdesk/geo.csv}"
BASE="${GEO_URL_BASE:-https://download.db-ip.com/free}"
MAX_AGE_DAYS="${GEO_MAX_AGE_DAYS:-35}"
TMP="${OUT}.download"

log() { echo "$(date -u +%FT%TZ) geo: $*"; }

month_ago() { date -u -d "@$(( $(date +%s) - $1 * 86400 ))" +%Y-%m 2>/dev/null || date -u +%Y-%m; }

fetch() {
    if [ -n "${GEO_SOURCE:-}" ]; then
        cp "$GEO_SOURCE" "$TMP"
        return 0
    fi
    # Файл месяца появляется в его начале — пробуем текущий и предыдущий.
    for month in $(date -u +%Y-%m) "$(month_ago 20)" "$(month_ago 45)"; do
        if curl -fsSL --retry 3 -o "$TMP" "$BASE/dbip-city-lite-$month.csv.gz"; then
            log "скачан dbip-city-lite-$month"
            return 0
        fi
    done
    return 1
}

convert() {
    # Поля: начало,конец,континент,страна,регион,город,широта,долгота.
    # В названиях бывают запятые в кавычках, поэтому координаты берём с конца.
    gunzip -c "$TMP" | awk -F, '
        function ip2n(ip,   p) { split(ip, p, "."); return ((p[1] * 256 + p[2]) * 256 + p[3]) * 256 + p[4] }
        function flush() { if (have) printf "%.0f,%.0f,%s,%s\n", s, e, la, lo }
        $1 !~ /:/ && $1 ~ /^[0-9.]+$/ {
            a = ip2n($1); b = ip2n($2)
            lat = sprintf("%.1f", $(NF - 1)); lon = sprintf("%.1f", $NF)
            if (have && a == e + 1 && lat == la && lon == lo) { e = b; next }
            flush(); s = a; e = b; la = lat; lo = lon; have = 1
        }
        END { flush() }
    ' > "$OUT.tmp"
    lines=$(wc -l < "$OUT.tmp")
    if [ "$lines" -lt "${GEO_MIN_LINES:-1000}" ]; then
        log "в файле всего $lines диапазонов — похоже, скачалось не то, оставляю прежний"
        rm -f "$OUT.tmp"
        return 1
    fi
    mv "$OUT.tmp" "$OUT"
    log "готово: $lines диапазонов → $OUT"
}

update() {
    mkdir -p "$(dirname "$OUT")"
    if fetch && convert; then
        rm -f "$TMP"
        return 0
    fi
    rm -f "$TMP" "$OUT.tmp"
    log "не удалось обновить базу, hbbs работает с прежней (или раздаёт узлы по кругу)"
    return 1
}

stale() {
    [ ! -s "$OUT" ] && return 0
    [ -n "$(find "$OUT" -mtime +"$MAX_AGE_DAYS" 2>/dev/null)" ]
}

if [ "${1:-}" = "--once" ]; then
    update
    exit $?
fi

log "проверка раз в сутки, обновление старше $MAX_AGE_DAYS дней"
while true; do
    if stale; then update || true; fi
    sleep 86400
done
