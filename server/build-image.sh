#!/usr/bin/env bash
# Собирает образ сервера RemIT (hbbs, hbbr и панель) прямо на машине.
#
#   sudo bash server/build-image.sh
#
# То же самое, что делает .github/workflows/build-server-image.yml, но без
# GitHub Actions: нужен только Docker, компиляторы Node, Go и Rust ставить не
# надо — каждый шаг выполняется в официальном образе.
#
# После сборки пропишите тег в server/.env:
#   RUSTDESK_IMAGE=remit/rustdesk-server-s6:latest

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WORKDIR="${REPO_ROOT}/.build/rustdesk-server-image"
IMAGE="remit/rustdesk-server-s6:latest"
ARCH=""
KEEP=0

usage() {
    cat <<USAGE
Использование: bash server/build-image.sh [опции]

  --workdir  каталог для исходников, по умолчанию ${WORKDIR}
  --image    тег итогового образа, по умолчанию ${IMAGE}
  --arch     amd64 или arm64, по умолчанию определяется автоматически
  --keep     не удалять исходники после сборки (по умолчанию они остаются)
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --workdir) WORKDIR="$2"; shift 2 ;;
        --image) IMAGE="$2"; shift 2 ;;
        --arch) ARCH="$2"; shift 2 ;;
        --keep) KEEP=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Неизвестный параметр: $1" >&2; usage; exit 1 ;;
    esac
done

command -v docker >/dev/null || { echo "Нужен Docker" >&2; exit 1; }
command -v git >/dev/null || { echo "Нужен git" >&2; exit 1; }
command -v python3 >/dev/null || { echo "Нужен python3" >&2; exit 1; }

if [[ -z "$ARCH" ]]; then
    case "$(uname -m)" in
        x86_64) ARCH=amd64 ;;
        aarch64|arm64) ARCH=arm64 ;;
        *) echo "Неизвестная архитектура $(uname -m): укажите --arch" >&2; exit 1 ;;
    esac
fi
case "$ARCH" in
    amd64) RUST_TARGET=x86_64-unknown-linux-musl; S6_ARCH=x86_64; MUSL_CC=musl-gcc ;;
    arm64) RUST_TARGET=aarch64-unknown-linux-musl; S6_ARCH=aarch64; MUSL_CC=musl-gcc ;;
    *) echo "Поддерживаются только amd64 и arm64" >&2; exit 1 ;;
esac

echo "==> Архитектура: ${ARCH} (${RUST_TARGET})"
mkdir -p "$WORKDIR"

clone() {  # clone <репозиторий> <ветка> <каталог> [recursive]
    local url="$1" ref="$2" name="$3" recursive="${4:-}"
    local dir="${WORKDIR}/${name}"
    if [[ -d "$dir/.git" ]]; then
        echo "==> Обновляю ${name}"
        git -C "$dir" fetch --depth 1 origin "$ref"
        git -C "$dir" checkout -f FETCH_HEAD
    else
        echo "==> Клонирую ${name}"
        git clone --depth 1 --branch "$ref" "$url" "$dir"
    fi
    if [[ "$recursive" == "recursive" ]]; then
        git -C "$dir" submodule update --init --recursive --depth 1
    fi
}

clone https://github.com/lejianwen/rustdesk-api.git master rustdesk-api
clone https://github.com/lejianwen/rustdesk-api-web.git master rustdesk-api-web
clone https://github.com/lejianwen/rustdesk-server.git forapi rustdesk-server recursive

echo "==> Встраиваю проверку суточного лимита в hbbs"
python3 "${REPO_ROOT}/client/patches/hbbs-quota-hook.py" \
    "${WORKDIR}/rustdesk-server/src/rendezvous_server.rs"

# Каждый компилятор — в своём официальном образе, чтобы на сервере не
# заводить ни Node, ни Go, ни Rust. Контейнеры работают под root: сборке нужен
# apt-get (musl-tools), поэтому владельца файлов возвращаем в конце.
OWNER="$(stat -c '%u:%g' "$WORKDIR")"
run_in() {  # run_in <образ> <каталог внутри WORKDIR> <команды>
    docker run --rm \
        -v "${WORKDIR}:/work" -w "/work/$2" \
        "$1" bash -lc "$3"
}

echo "==> Собираю веб-интерфейс панели"
run_in node:20 rustdesk-api-web 'npm ci && npm run build'

echo "==> Собираю API панели"
rm -rf "${WORKDIR}/rustdesk-api/resources/admin"
mkdir -p "${WORKDIR}/rustdesk-api/resources/admin"
cp -a "${WORKDIR}/rustdesk-api-web/dist/." "${WORKDIR}/rustdesk-api/resources/admin/"
mkdir -p "${WORKDIR}/rustdesk-api/${ARCH}/release/data" \
         "${WORKDIR}/rustdesk-api/${ARCH}/release/runtime"
cp -a "${WORKDIR}/rustdesk-api/resources" "${WORKDIR}/rustdesk-api/docs" \
      "${WORKDIR}/rustdesk-api/conf" "${WORKDIR}/rustdesk-api/${ARCH}/release/"
run_in golang:1.23 rustdesk-api "
    apt-get update -qq && apt-get install -y -qq musl-tools &&
    go mod download &&
    CGO_ENABLED=1 GOOS=linux GOARCH=${ARCH} CC=${MUSL_CC} CGO_LDFLAGS=-static \
        go build -ldflags '-s -w' -o ${ARCH}/release/apimain ./cmd/apimain.go"

echo "==> Собираю hbbs, hbbr и rustdesk-utils"
# musl-tools даёт musl-gcc — без него линковка musl-цели падает.
run_in rust:1-bookworm rustdesk-server "
    apt-get update -qq && apt-get install -y -qq musl-tools &&
    rustup target add ${RUST_TARGET} &&
    cargo build --release --all-features --target=${RUST_TARGET}"

echo "==> Возвращаю владельца файлов"
chown -R "$OWNER" "$WORKDIR"

echo "==> Раскладываю бинарники"
for binary in hbbs hbbr rustdesk-utils; do
    install -m 0755 \
        "${WORKDIR}/rustdesk-server/target/${RUST_TARGET}/release/${binary}" \
        "${WORKDIR}/rustdesk-server/docker/rootfs/usr/bin/${binary}"
done

echo "==> Собираю базовый образ панели"
docker build --build-arg "BUILDARCH=${ARCH}" \
    -f "${WORKDIR}/rustdesk-api/Dockerfile" \
    -t remit-api:build "${WORKDIR}/rustdesk-api"

echo "==> Собираю итоговый образ"
sed -i "1c FROM remit-api:build" "${WORKDIR}/rustdesk-server/docker/Dockerfile"
docker build --build-arg "S6_ARCH=${S6_ARCH}" -t "$IMAGE" \
    "${WORKDIR}/rustdesk-server/docker"

if [[ "$KEEP" == "0" ]]; then
    echo "==> Исходники остались в ${WORKDIR} (удалите вручную, если не нужны)"
fi

cat <<DONE

============================================================
  Образ собран: ${IMAGE}

  Пропишите его в server/.env:
      RUSTDESK_IMAGE=${IMAGE}

  и перезапустите стек:
      docker compose -f server/docker-compose.yml up -d
============================================================
DONE
