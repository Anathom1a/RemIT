#!/usr/bin/env python3
"""Проверяет, что nginx отдаёт сайту все его пути и что сайт знает все пути клиента.

    python3 server/nginx/check-routes.py [путь к конфигу]

Две проверки:
1. Каждый маршрут из app/api по правилам nginx (точное совпадение важнее,
   среди префиксов побеждает самый длинный) уходит на сайт. Так уже было с
   /api/version/latest: маршрут в приложении был, а nginx отдавал путь
   другому серверу, и проверка обновлений молча возвращала 404.
2. Для каждого пути, который вызывает клиент RustDesk, в app/api есть
   маршрут. API клиента обслуживает сам сайт, и забытый путь означает, что
   какая-то функция клиента тихо сломается.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CONF = ROOT / "server" / "nginx" / "remit.conf"
API_DIR = ROOT / "app" / "api"

SITE = "remit_web"

# Пути, которые вызывает клиент RustDesk (flutter/lib/models, src/hbbs_http,
# src/server/connection.rs). Динамический сегмент — obrazec.
CLIENT_PATHS = [
    "/api/login",
    "/api/login-options",
    "/api/logout",
    "/api/currentUser",
    "/api/heartbeat",
    "/api/sysinfo",
    "/api/sysinfo_ver",
    "/api/audit/conn",
    "/api/audit/file",
    "/api/audit/alarm",
    "/api/users",
    "/api/peers",
    "/api/device-group/accessible",
    "/api/ab",
    "/api/ab/settings",
    "/api/ab/personal",
    "/api/ab/shared/profiles",
    "/api/ab/peers",
    "/api/ab/tags/obrazec",
    "/api/ab/peer/add/obrazec",
    "/api/ab/peer/update/obrazec",
    "/api/ab/peer/obrazec",
    "/api/ab/tag/add/obrazec",
    "/api/ab/tag/rename/obrazec",
    "/api/ab/tag/update/obrazec",
    "/api/ab/tag/obrazec",
    "/api/version/latest",
    # Вход через VK ID в клиенте.
    "/api/oidc/auth",
    "/api/oidc/auth-query",
    "/api/user/info",
    # Веб-клиент (бета).
    "/api/server-config",
    "/api/server-config-v2",
    "/api/shared-peer",
]


def parse_locations(text: str) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Возвращает точные и префиксные location из блока с TLS."""
    # Берём server{} сайта (listen 443): первый редиректит http на https,
    # а блоки на 21118/21119 — WebSocket веб-клиента к hbbs и hbbr.
    servers = text.split("\nserver {")
    body = next((block for block in servers if "listen 443" in block), servers[-1])

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

    routes = set(site_routes())
    for uri in CLIENT_PATHS:
        if uri not in routes:
            failures.append(f"  {uri}: клиент вызывает этот путь, а маршрута в app/api нет")

    if failures:
        print("Маршруты nginx разъехались с приложением:")
        print("\n".join(failures))
        print("\nПоправьте server/nginx/remit.conf или добавьте маршрут в app/api.")
        return 1

    print(f"Проверено маршрутов сайта: {len(routes)}, путей клиента: {len(CLIENT_PATHS)}. Расхождений нет.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
