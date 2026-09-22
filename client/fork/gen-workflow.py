#!/usr/bin/env python3
"""Собирает remit-build.yml из апстримного .github/workflows/flutter-build.yml."""
import re
import sys
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
lines = src.read_text(encoding="utf-8").splitlines()


def block(start, end):  # 1-indexed, inclusive
    return "\n".join(lines[start - 1:end])


def env_value(name):
    for ln in lines[:60]:
        m = re.match(rf'^\s*{name}:\s*"([^"]*)"', ln)
        if m:
            return m.group(1)
    raise SystemExit(f"не нашёл {name} в env апстрима")


VERSION = env_value("VERSION")
BRAND_STEP = """
      - name: Фирменные правки RemIT
        shell: bash
        env:
          REMIT_PUBLIC_KEY: ${{ secrets.REMIT_PUBLIC_KEY || vars.REMIT_PUBLIC_KEY }}
          REMIT_SITE: ${{ vars.REMIT_SITE }}
          REMIT_APP_NAME: ${{ vars.REMIT_APP_NAME }}
          REMIT_ID_SERVER: ${{ vars.REMIT_ID_SERVER }}
          REMIT_RELAY_SERVER: ${{ vars.REMIT_RELAY_SERVER }}
          REMIT_TEST_BUILD: ${{ env.REMIT_TEST_BUILD }}
        run: bash remit/apply-branding.sh
"""

CHECKOUT_RE = re.compile(
    r"(      - name: Checkout source code\n"
    r"        uses: actions/checkout@[0-9a-f]+ # v4\n"
    r"        with:\n"
    r"          submodules: recursive\n)"
)


def with_brand(text):
    text, n = CHECKOUT_RE.subn(r"\1" + BRAND_STEP, text)
    if n != 1:
        raise SystemExit(f"ожидался один checkout, найдено {n}")
    return text


def drop(text, needle_start, needle_end):
    """Вырезает кусок матрицы от строки, содержащей needle_start, до первой '}' после needle_end."""
    out, skipping = [], False
    for ln in text.splitlines():
        if not skipping and needle_start in ln:
            skipping = True
            while out and out[-1].strip() == "- {":
                out.pop()
            continue
        if skipping:
            if needle_end in ln:
                skipping = False
            continue
        out.append(ln)
    if skipping:
        raise SystemExit("не нашёл конец вырезаемого блока")
    return "\n".join(out)


header = f"""# АВТОСБОРКА: получен из апстримного .github/workflows/flutter-build.yml
# (RustDesk {VERSION}) скриптом client/fork/gen-workflow.py репозитория RemIT.ru.
# Отличия от апстрима:
#   * остались только Windows x86_64, macOS x86_64/aarch64 и Linux x86_64;
#   * после checkout выполняется remit/apply-branding.sh;
#   * запуск вручную через «Run workflow» или правкой файла .build-trigger.
name: RemIT — сборка клиента

on:
  workflow_dispatch:
    inputs:
      upload_tag:
        description: "Тег черновика релиза в этом репозитории"
        type: string
        default: "remit"
      windows:
        description: "Собирать Windows x86_64"
        type: boolean
        default: true
      macos:
        description: "Собирать macOS (Intel и Apple Silicon)"
        type: boolean
        default: true
      linux:
        description: "Собирать Linux x86_64 (deb, rpm, AppImage)"
        type: boolean
        default: true
      test_build:
        description: "Тестовая сборка: собрать без ключа сервера (клиент не подключится)"
        type: boolean
        default: false
  # Запасной способ запуска: «Run workflow» в интерфейсе доступен только для
  # workflow'ов из ветки по умолчанию. Чтобы сборку можно было запустить, не
  # трогая ветку по умолчанию, следим за файлом .build-trigger: поменяли его и
  # запушили в remit — пошла сборка всех трёх систем. Остальные правки в
  # ветке сборку не запускают.
  push:
    branches:
      - remit
    paths:
      - ".build-trigger"

permissions:
  contents: write

env:
  SCITER_RUST_VERSION: "{env_value('SCITER_RUST_VERSION')}"
  RUST_VERSION: "{env_value('RUST_VERSION')}"
  MAC_RUST_VERSION: "{env_value('MAC_RUST_VERSION')}"
  LLVM_VERSION: "{env_value('LLVM_VERSION')}"
  FLUTTER_VERSION: "{env_value('FLUTTER_VERSION')}"
  FLUTTER_WINDOWS_ARM_VERSION: "{env_value('FLUTTER_WINDOWS_ARM_VERSION')}"
  CARGO_EXPAND_VERSION: "1.0.95"
  FLUTTER_RUST_BRIDGE_VERSION: "1.80.1"
  BRIDGE_FLUTTER_VERSION: "3.22.3"
  VCPKG_COMMIT_ID: "{env_value('VCPKG_COMMIT_ID')}"
  VCPKG_BINARY_SOURCES: "clear;x-gha,readwrite"
  VERSION: "{VERSION}"
  TAG_NAME: "${{{{ inputs.upload_tag || 'remit' }}}}"
  UPLOAD_ARTIFACT: "true"
  # Тестовая сборка — «посмотреть, как выглядит», пока нет ключа сервера.
  # Включается галочкой при ручном запуске; при запуске через .build-trigger
  # режим берётся из самого файла (см. remit/apply-branding.sh).
  REMIT_TEST_BUILD: "${{{{ inputs.test_build }}}}"
  MACOS_P12_BASE64: "${{{{ secrets.MACOS_P12_BASE64 }}}}"
  SIGN_BASE_URL: "${{{{ secrets.SIGN_BASE_URL }}}}-2"

jobs:
  generate-bridge:
    name: flutter-rust-bridge
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout source code
        uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
        with:
          submodules: recursive

      - name: Install prerequisites
        run: |
          sudo apt-get install ca-certificates -y
          sudo apt-get update -y
          sudo apt-get install -y \\
            clang cmake curl gcc git g++ libclang-dev libgtk-3-dev \\
            llvm-dev nasm ninja-build pkg-config wget

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: ${{{{ env.RUST_VERSION }}}}
          targets: x86_64-unknown-linux-gnu
          components: "rustfmt"

      - uses: Swatinem/rust-cache@e18b497796c12c097a38f9edb9d0641fb99eee32 # v2
        with:
          prefix-key: bridge-ubuntu-22.04

      - name: Cache Bridge
        id: cache-bridge
        uses: actions/cache@6f8efc29b200d32929f49075959781ed54ec270c # v3
        with:
          path: /tmp/flutter_rust_bridge
          key: bridge-${{{{ env.BRIDGE_FLUTTER_VERSION }}}}

      - name: Install flutter
        uses: subosito/flutter-action@1a449444c387b1966244ae4d4f8c696479add0b2 # v2
        with:
          channel: "stable"
          flutter-version: ${{{{ env.BRIDGE_FLUTTER_VERSION }}}}
          cache: true

      - name: Install flutter rust bridge deps
        shell: bash
        run: |
          cargo install cargo-expand --version ${{{{ env.CARGO_EXPAND_VERSION }}}} --locked
          cargo install flutter_rust_bridge_codegen --version ${{{{ env.FLUTTER_RUST_BRIDGE_VERSION }}}} --features "uuid" --locked
          # extended_text 14 требует более свежий Dart, чем во Flutter 3.22.3
          sed -i -e 's/extended_text: 14.0.0/extended_text: 13.0.0/g' flutter/pubspec.yaml
          pushd flutter && flutter pub get && popd

      - name: Run flutter rust bridge
        run: |
          ~/.cargo/bin/flutter_rust_bridge_codegen --rust-input ./src/flutter_ffi.rs --dart-output ./flutter/lib/generated_bridge.dart --c-output ./flutter/macos/Runner/bridge_generated.h
          cp ./flutter/macos/Runner/bridge_generated.h ./flutter/ios/Runner/bridge_generated.h

      - name: Upload Artifact
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: bridge-artifact
          path: |
            ./src/bridge_generated.rs
            ./src/bridge_generated.io.rs
            ./flutter/lib/generated_bridge.dart
            ./flutter/lib/generated_bridge.freezed.dart
            ./flutter/macos/Runner/bridge_generated.h
            ./flutter/ios/Runner/bridge_generated.h
"""

# --- окно поверх всех окон (нужно виндовой сборке) ---
topmost = block(59, 78)
topmost = drop(topmost, "target: windows-11-arm,", "}")
topmost = topmost.replace(
    "  build-RustDeskTempTopMostWindow:",
    "  build-RustDeskTempTopMostWindow:\n    if: ${{ github.event_name != 'workflow_dispatch' || inputs.windows }}",
).replace("${{ inputs.upload-artifact }}", "true")

# --- Windows ---
win = with_brand(block(80, 377))
win = drop(win, "target: aarch64-pc-windows-msvc,", "}")
# Установщик MSI собирается по имени приложения, и у preprocess.py оно по
# умолчанию RustDesk. Без --app-name пакет ставился в C:\\Program Files\\RustDesk,
# а приложение потом искало себя в папке со своим именем: не запускалось после
# установки и не удалялось — запись в «Программах» вела на несуществующий файл.
_msi_old = "python preprocess.py --arp -d ../../rustdesk"
_msi_new = (
    "python preprocess.py --arp -d ../../rustdesk "
    "--app-name \"${{ vars.REMIT_APP_NAME || 'RemIT' }}\""
)
if _msi_old not in win:
    raise SystemExit("не нашёл вызов preprocess.py — обновите скрипт")
win = win.replace(_msi_old, _msi_new, 1)

win = win.replace(
    "    needs: [build-RustDeskTempTopMostWindow, generate-bridge]",
    "    if: ${{ github.event_name != 'workflow_dispatch' || inputs.windows }}\n    needs: [build-RustDeskTempTopMostWindow, generate-bridge]",
).replace("if: ${{ inputs.upload-artifact }}", "if: true")

# --- macOS ---
mac = with_brand(block(650, 866))
# Без подписи create-dmg уже кладёт архитектуру в имя, а шаг «Rename rustdesk»
# приписывает её второй раз: выходило rustdesk-1.4.9-x86_64-x86_64.dmg.
# Наш автообновлятор ждёт rustdesk-<версия>-<архитектура>.dmg, поэтому имя без
# подписи делаем таким же, как у подписанного, — с одной архитектурой.
for _old, _new in [
    (
        "185 rustdesk-${{ env.VERSION }}-${{ matrix.job.arch }}.dmg ./flutter/build",
        "185 rustdesk-${{ env.VERSION }}.dmg ./flutter/build",
    ),
    (
        "path: rustdesk-${{ env.VERSION }}-${{ matrix.job.arch }}.dmg #",
        "path: rustdesk-${{ env.VERSION }}.dmg #",
    ),
]:
    if _old not in mac:
        raise SystemExit(f"не нашёл строку для правки имени dmg: {_old}")
    mac = mac.replace(_old, _new, 1)
mac = mac.replace(
    "    needs: [generate-bridge]",
    "    if: ${{ github.event_name != 'workflow_dispatch' || inputs.macos }}\n    needs: [generate-bridge]",
)

# --- Linux ---
lin = with_brand(block(1387, 1722))
lin = drop(lin, "arch: aarch64,", "}")
lin = lin.replace(
    "    needs: [generate-bridge]",
    "    if: ${{ github.event_name != 'workflow_dispatch' || inputs.linux }}\n    needs: [generate-bridge]",
)

# --- AppImage ---
app = block(1951, 2001)
app = "\n".join(
    ln for ln in app.splitlines()
    if "target: aarch64-unknown-linux-gnu, arch: aarch64" not in ln
)
app = app.replace("    if: ${{ inputs.upload-artifact }}", "    if: ${{ github.event_name != 'workflow_dispatch' || inputs.linux }}")

parts = [header.rstrip("\n"), topmost, win, mac, lin, app]
dst.write_text("\n\n".join(p.rstrip("\n") for p in parts) + "\n", encoding="utf-8")
print(f"записан {dst}")
