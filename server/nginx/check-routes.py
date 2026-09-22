#!/usr/bin/env python3
"""Проверяет, что nginx отдаёт каждый путь сайта сайту, а не панели.

    python3 server/nginx/check-routes.py [путь к конфигу]

Зачем: сайт и панель rustdesk-api живут на одном домене и делят префикс /api/.
Панель забирает /api/ целиком, поэтому каждый наш путь внутри /api/ должен быть
перечислен в конфиге отдельно. Забыли — запрос молча уходит в панель и
возвращает 404. Так уже случилось с /api/version/latest: проверка обновлений
в клиенте перестала работать, хотя маршрут в приложении был на месте.

Скрипт разбирает location из server/nginx/remit.conf по правилам nginx
(точное совпадение важнее, среди префиксов побеждает самый длинный) и сверяет
с маршрутами из app/api.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CONF = ROOT / "server" / "nginx" / "remit.conf"
API_DIR = ROOT / "app" / "api"

SITE = "remit_web"
PANEL = "rustdesk_api"

# Пути панели, которые обслуживают вход, адресную книгу и доступные устройства
# в клиенте: они должны остаться за панелью.
PANEL_PATHS = [
    "/api/login",
    "/api/currentUser",
    "/api/ab",
    "/api/ab/personal",
    "/api/ab/peers",
    "/api/ab/shared/profiles",
    "/api/device-group/accessible",
    "/api/peers",
    "/api/sysinfo",
    "/api/login-options",
    "/api/version",
]


def parse_locations(text: str) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Возвращает точные и префиксные location из блока с TLS."""
    # Берём только второй server{}: первый редиректит http на https.
    servers = text.split("\nserver {")
    body = servers[-1]

    exact: list[tuple[str, str]] = []
    prefix: list[tuple[str, str]] = []
    pattern = re.compile(
        r"location\s+(=\s+)?(\S+)\s*\{(.*?)\n    \}", re.DOTALL
    )
    for match in pattern.finditer(body):
        is_exact, path, block = match.groups()
        upstream = re.search(r"proxy_pass\s+http://([A-Za-z0-9_]+)", block)
        target = upstream.group(1) if upstream else "static"
        (exact if is_exact else prefix).append((path, target))
    return exact, prefix


def resolve(uri: str, exact, prefix) -> str:
    """Повторяет выбор location в nginx: сначала =, потом самый длинный префикс."""
    for path, target in exact:
        if uri == path:
            return target
    best_path, best_target = "", None
    for path, target in prefix:
        if uri.startswith(path) and len(path) > len(best_path):
            best_path, best_target = path, target
    return best_target or "нет совпадения"


def site_routes() -> list[str]:
    """Маршруты сайта из app/api: динамические сегменты заменяем образцом."""
    routes = []
    for route in sorted(API_DIR.rglob("route.ts")):
        parts = route.relative_to(ROOT / "app").parent.parts
        segments = []
        for part in parts:
            if part.startswith("[") and part.endswith("]"):
                segments.append("obrazec")
            else:
                segments.append(part)
        routes.append("/" + "/".join(segments))
    return routes


def main() -> int:
    conf = Path(sys.argv[1]) if len(sys.argv) > 1 else CONF
    exact, prefix = parse_locations(conf.read_text(encoding="utf-8"))
    if not exact or not prefix:
        print("Не разобрал location из конфига", file=sys.stderr)
        return 1

    failures = []
    for uri in site_routes():
        target = resolve(uri, exact, prefix)
        if target != SITE:
            failures.append(f"  {uri} -> {target}, а должен идти на сайт")

    for uri in PANEL_PATHS:
        target = resolve(uri, exact, prefix)
        if target != PANEL:
            failures.append(f"  {uri} -> {target}, а должен идти в панель")

    if failures:
        print("Маршруты nginx разъехались с приложением:")
        print("\n".join(failures))
        print("\nДобавьте location в server/nginx/remit.conf.")
        return 1

    print(f"Проверено маршрутов сайта: {len(site_routes())}, путей панели: {len(PANEL_PATHS)}. Расхождений нет.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
