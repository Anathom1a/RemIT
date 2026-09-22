#!/usr/bin/env bash
# Раскладывает сборочную обвязку RemIT в клон форка rustdesk/rustdesk.
#
#   git clone https://github.com/<логин>/rustdesk.git ~/rustdesk-fork
#   bash client/sync-fork.sh --fork ~/rustdesk-fork --tag 1.4.9
#
# После этого в форке появляется ветка remit:
#   .github/workflows/remit-build.yml   — сборка Windows/macOS/Linux
#   remit/apply-branding.sh             — наши правки, накатываются в CI
#   remit/patches/                      — сами патчи
#   remit/brand/                        — иконки и логотипы (если есть)
#
# Исходники апстрима не трогаются: брендирование выполняется во время сборки.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FORK=""
TAG=""
BRANCH="remit"
PUSH=0
BUILD=""

usage() {
    cat <<USAGE
Использование: bash client/sync-fork.sh --fork <каталог клона форка> [опции]

  --fork     каталог с клоном вашего форка rustdesk/rustdesk (обязательно)
  --tag      версия RustDesk, на которую ставим ветку, например 1.4.9
  --branch   имя ветки в форке, по умолчанию ${BRANCH}
  --push     сразу отправить ветку в origin
  --build    запустить сборку: test (без ключа, посмотреть) или release
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fork) FORK="$2"; shift 2 ;;
        --tag) TAG="$2"; shift 2 ;;
        --branch) BRANCH="$2"; shift 2 ;;
        --push) PUSH=1; shift ;;
        --build) BUILD="$2"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Неизвестный параметр: $1" >&2; usage; exit 1 ;;
    esac
done

[[ -n "$FORK" ]] || { echo "Не указан --fork" >&2; usage; exit 1; }
[[ -d "$FORK/.git" ]] || { echo "${FORK} — не клон git" >&2; exit 1; }

if [[ -n "$TAG" ]]; then
    echo "==> Ветка ${BRANCH} от тега ${TAG}"
    git -C "$FORK" remote get-url upstream >/dev/null 2>&1 \
        || git -C "$FORK" remote add upstream https://github.com/rustdesk/rustdesk.git
    git -C "$FORK" fetch upstream "refs/tags/${TAG}:refs/tags/${TAG}"
    git -C "$FORK" checkout -B "$BRANCH" "tags/${TAG}"
else
    echo "==> Ветка ${BRANCH} (тег не указан, база не меняется)"
    git -C "$FORK" checkout -B "$BRANCH"
fi

echo "==> Копирую сборочную обвязку"
mkdir -p "${FORK}/.github/workflows" "${FORK}/remit/patches"
cp -f "${REPO_ROOT}/client/fork/workflows/remit-build.yml" "${FORK}/.github/workflows/remit-build.yml"
cp -f "${REPO_ROOT}/client/fork/remit/apply-branding.sh" "${FORK}/remit/apply-branding.sh"
chmod +x "${FORK}/remit/apply-branding.sh"
cp -f "${REPO_ROOT}/client/patches/brand-client.py" "${FORK}/remit/patches/brand-client.py"
cp -f "${REPO_ROOT}/client/patches/remit_status.dart" "${FORK}/remit/patches/remit_status.dart"

if [[ -d "${REPO_ROOT}/client/brand" ]]; then
    echo "==> Копирую оформление"
    rm -rf "${FORK}/remit/brand"
    mkdir -p "${FORK}/remit/brand"
    # generate-brand.py и README остаются в RemIT.ru: в форк едут готовые файлы
    (cd "${REPO_ROOT}/client/brand" && tar -cf - \
        --exclude='README.md' --exclude='generate-brand.py' .) \
        | (cd "${FORK}/remit/brand" && tar -xf -)
    echo "    файлов: $(find "${FORK}/remit/brand" -type f | wc -l)"
else
    echo "==> Каталога client/brand нет — иконки останутся стандартными"
fi

# .build-trigger — единственный файл, изменение которого запускает сборку.
# Так правки патчей не жгут раннеры сами по себе.
if [[ -n "$BUILD" ]]; then
    case "$BUILD" in
        test|release) ;;
        *) echo "--build принимает test или release" >&2; exit 1 ;;
    esac
    echo "==> Запускаю сборку: ${BUILD}"
    printf '%s %s\n' "$BUILD" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        > "${FORK}/.build-trigger"
fi

git -C "$FORK" add -f .github/workflows/remit-build.yml remit
[[ -f "${FORK}/.build-trigger" ]] && git -C "$FORK" add -f .build-trigger
if git -C "$FORK" diff --cached --quiet; then
    echo "==> Изменений нет"
else
    git -C "$FORK" commit -m "RemIT: сборочная обвязка и фирменные правки"
    echo "==> Коммит создан"
fi

if [[ "$PUSH" == "1" ]]; then
    echo "==> Отправляю ветку"
    git -C "$FORK" push -u origin "$BRANCH"
fi

cat <<DONE

============================================================
  Форк готов: ${FORK} (ветка ${BRANCH})

  Дальше в настройках форка на GitHub:
    Actions -> включить workflow'ы форка
    Settings -> Secrets and variables -> Actions -> Variables:
      REMIT_PUBLIC_KEY   открытый ключ hbbs (обязательно)
      REMIT_SITE         https://remit.su
      REMIT_APP_NAME     RemIT
      REMIT_ID_SERVER    remit.su
      REMIT_RELAY_SERVER remit.su

  Затем Actions -> «RemIT — сборка клиента» -> Run workflow.
============================================================
DONE
