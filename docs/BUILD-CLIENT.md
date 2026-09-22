# Сборка фирменного клиента: Windows, macOS, Linux

Клиент собирается из исходников RustDesk с нашими правками. Правки не «ручные»:
их накатывает скрипт, поэтому сборку можно повторить для любой версии RustDesk.

Собирать можно двумя путями: в GitHub Actions форка RustDesk (основной,
см. раздел «Сборка в GitHub Actions») или вручную на трёх машинах — шаги
ниже описывают именно ручную сборку.

Что именно попадает в сборку:

| Правка | Где |
|---|---|
| Название, иконки, адреса серверов и ключ | `libs/hbb_common/src/config.rs` |
| Проверка обновлений на нашем сервере | `libs/hbb_common/src/lib.rs`, `src/common.rs`, `flutter/lib/common.dart` |
| Карточка «доступна новая версия» | `flutter/lib/desktop/pages/desktop_home_page.dart`, `flutter/lib/mobile/pages/connection_page.dart` |
| Логотип-ссылка на сайт | `flutter/lib/common.dart` |
| Карточка тарифа: остаток времени и срок подписки | `flutter/lib/remit_status.dart` |
| Адреса серверов закреплены намертво, пункт «ID/Relay Server» скрыт | `libs/hbb_common/src/config.rs`, `src/common.rs` |
| Иконки и логотипы | `res/`, `flutter/assets/`, `flutter/windows`, `flutter/macos`, `flutter/android` |

## Шаг 0. Что нужно под рукой

- **Открытый ключ сервера** — без него клиент не подключится к нашей
  инфраструктуре:

  ```bash
  cat /opt/remit/server/data/rustdesk/id_ed25519.pub
  ```

- **Версия RustDesk**, от которой собираем, — тег вида `1.4.2`. Берите
  последний стабильный тег из репозитория RustDesk.
- **Иконки и логотипы** уже готовы и лежат в `client/brand/` — скрипт сам
  заменяет ими все иконки RustDesk. Перерисовать: `python3
  client/brand/generate-brand.py`.

## Шаг 1. Подготовка исходников (одинаково для всех систем)

```bash
export REMIT_PUBLIC_KEY="$(cat id_ed25519.pub)"

bash client/prepare-sources.sh \
  --tag 1.4.2 \
  --out ~/build/remit-client \
  --site https://remit.su \
  --id-server remit.su \
  --relay-server remit.su
```

Скрипт клонирует RustDesk нужной версии, накатывает правки и копирует
оформление. Повторный запуск безопасен: применённые правки пропускаются.
Если исходники RustDesk изменились и точка вставки не найдена, скрипт
остановится с понятной ошибкой — это лучше, чем молча собрать клиент без
нашей логики.

## Шаг 2. Окружение сборки

Общее для всех систем:

- **Rust** stable (`rustup`);
- **Flutter** — версию берите ту же, что у RustDesk в
  `.github/workflows/flutter-build.yml` выбранного тега (переменная
  `FLUTTER_VERSION`), иначе возможны расхождения в зависимостях;
- **Python 3** — им запускается `build.py`;
- **vcpkg** с библиотеками `libvpx`, `libyuv`, `opus`, `aom`;
- **flutter_rust_bridge_codegen** — генерирует мост между Rust и Flutter.

```bash
git clone https://github.com/microsoft/vcpkg ~/vcpkg
~/vcpkg/bootstrap-vcpkg.sh          # на Windows: bootstrap-vcpkg.bat
export VCPKG_ROOT=~/vcpkg
```

### Windows

1. **Visual Studio Build Tools** с рабочей нагрузкой «Разработка классических
   приложений на C++» (MSVC, Windows SDK).
2. **LLVM/Clang**, **nasm**, **yasm**, **CMake**, **Git**, **Python 3**.
3. Библиотеки — статические сборки:

   ```powershell
   $env:VCPKG_ROOT="C:\vcpkg"
   C:\vcpkg\vcpkg install libvpx:x64-windows-static libyuv:x64-windows-static opus:x64-windows-static aom:x64-windows-static
   ```

4. Сборка:

   ```powershell
   cd $HOME\build\remit-client
   flutter pub get
   cargo install flutter_rust_bridge_codegen --version <версия из pubspec клиента> --locked
   flutter_rust_bridge_codegen --rust-input ./src/flutter_ffi.rs --dart-output ./flutter/lib/generated_bridge.dart
   python build.py --flutter
   ```

   На выходе — установщик и портативная сборка в каталоге проекта.

### Linux (Ubuntu 22.04 и новее)

```bash
sudo apt update
sudo apt install -y zip g++ gcc git curl wget nasm yasm libgtk-3-dev clang \
  libxcb-randr0-dev libxdo-dev libxfixes-dev libxcb-shape0-dev libxcb-xfixes0-dev \
  libasound2-dev libpulse-dev cmake make libclang-dev ninja-build \
  libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libva-dev libvdpau-dev

$VCPKG_ROOT/vcpkg install libvpx libyuv opus aom

cd ~/build/remit-client
flutter pub get
flutter_rust_bridge_codegen --rust-input ./src/flutter_ffi.rs --dart-output ./flutter/lib/generated_bridge.dart
python3 build.py --flutter
```

Получится `.deb`. Для `.rpm` и AppImage у RustDesk есть отдельные цели в
`build.py` и скрипты в `res/` — смотрите их для выбранного тега.

### macOS

```bash
xcode-select --install
brew install nasm yasm cmake pkg-config llvm create-dmg

$VCPKG_ROOT/vcpkg install libvpx libyuv opus aom

cd ~/build/remit-client
flutter pub get
flutter_rust_bridge_codegen --rust-input ./src/flutter_ffi.rs --dart-output ./flutter/lib/generated_bridge.dart
python3 build.py --flutter
```

Собирайте на том же процессоре, для которого выпускаете: сборка с Apple
Silicon даёт `aarch64`, с Intel — `x86_64`. Нужны обе — собирайте дважды и
публикуйте два файла.

## Шаг 3. Подпись

Без подписи Windows будет пугать SmartScreen при каждой установке, а macOS
просто не запустит приложение.

- **Windows**: сертификат подписи кода (OV или EV), затем

  ```powershell
  signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a RemIT-Setup.exe
  ```

- **macOS**: Developer ID Application, подпись и нотаризация:

  ```bash
  codesign --deep --force --options runtime --sign "Developer ID Application: ..." RemIT.app
  xcrun notarytool submit RemIT.dmg --apple-id ... --team-id ... --password ... --wait
  xcrun stapler staple RemIT.dmg
  ```

- **Linux**: подпись не обязательна; если делаете репозиторий пакетов,
  подпишите его GPG-ключом.

## Шаг 4. Проверка сборки

Запустите собранный клиент и убедитесь:

1. в заголовке и в окне — ваше название, не RustDesk;
2. логотип открывает сайт по нажатию;
3. под полем пароля видна карточка тарифа: «Осталось сегодня …» или срок
   подписки (клиент должен видеть сайт по сети);
4. в «Настройки → Сеть» уже прописаны ваши ID-сервер, ретранслятор и ключ;
5. если на сайте опубликован выпуск новее — при запуске появляется
   «Доступна новая версия».

Если карточки тарифа нет — проверьте, что `api-server` в клиенте указывает на
сайт и что `/api/v1/client/state` отвечает (см. `docs/QUOTA.md`).

## Шаг 5. Публикация выпуска

```bash
export REMIT_SERVICE_TOKEN=...

bash client/publish-release.sh --version 1.4.2 \
  --file windows:x86_64:dist/RemIT-1.4.2-x86_64.exe \
  --file macos:aarch64:dist/RemIT-1.4.2.dmg \
  --file linux:x86_64:dist/remit_1.4.2_amd64.deb \
  --notes dist/notes.txt
```

Скрипт загрузит файлы на сайт, посчитает контрольные суммы, создаст выпуск и
опубликует его. После этого клиенты увидят обновление при следующем запуске.
Ключ `--draft` сохраняет выпуск черновиком, `--mandatory` помечает обновление
обязательным.

## Сборка в GitHub Actions — основной способ

Держать под рукой Windows, macOS и Linux ради выпуска не нужно: всё собирается
в GitHub Actions форка RustDesk. Это и дешевле (у публичного репозитория минуты
не лимитированы, а Windows и macOS в приватном считаются ×2 и ×10), и надёжнее:
у апстрима уже решены кеш vcpkg, версии Flutter и упаковка в exe/msi/dmg/deb.

1. **Форк.** Один раз открыть <https://github.com/rustdesk/rustdesk/fork> и
   создать форк в своём аккаунте. Оставить имя `rustdesk`, видимость —
   публичная (этого же требует AGPL-3.0 для производных клиента).

2. **Обвязка.** Склонировать форк и разложить в нём нашу сборочную обвязку:

   ```bash
   git clone https://github.com/<логин>/rustdesk.git ~/rustdesk-fork
   bash client/sync-fork.sh --fork ~/rustdesk-fork --tag 1.4.9 --push
   ```

   Скрипт ставит ветку `remit` на нужный тег RustDesk и кладёт в неё
   `.github/workflows/remit-build.yml`, `remit/apply-branding.sh` и
   патчи. Исходники апстрима не меняются: правки накатываются уже в CI, сразу
   после checkout.

3. **Переменные.** В форке: **Settings → Secrets and variables → Actions →
   Variables** завести `REMIT_PUBLIC_KEY` (открытый ключ hbbs) и при
   необходимости `REMIT_SITE`, `REMIT_APP_NAME`, `REMIT_ID_SERVER`,
   `REMIT_RELAY_SERVER`. Без ключа сборка останавливается с понятной
   ошибкой — собрать клиент с чужим сервером по недосмотру нельзя.

4. **Запуск.** Вкладка **Actions** → согласиться включить workflow'ы форка.
   Затем сделать `remit` веткой по умолчанию (Settings → General → Default
   branch) — кнопка «Run workflow» появляется только у workflow'ов из ветки по
   умолчанию. После этого: «RemIT — сборка клиента» → **Run workflow**,
   галочки выбирают системы.

   Второй способ, без смены ветки по умолчанию, — файл `.build-trigger`:

   ```bash
   bash client/sync-fork.sh --fork ~/rustdesk-fork --build test --push
   ```

   `test` — сборка без ключа сервера, только посмотреть; `release` — рабочая.
   Сборку запускает именно изменение `.build-trigger`, остальные правки в
   ветке раннеры не жгут.

5. **Результат.** Файлы лежат в артефактах прогона и в черновом релизе форка:

   ```
   rustdesk-1.4.9-x86_64.exe    rustdesk-1.4.9-x86_64.msi
   rustdesk-1.4.9-x86_64.dmg    rustdesk-1.4.9-aarch64.dmg
   rustdesk-1.4.9-x86_64.deb    rustdesk-1.4.9-x86_64.rpm
   rustdesk-1.4.9-x86_64.AppImage
   ```

   Имена совпадают с тем, что ждёт встроенный автообновлятор, поэтому их сразу
   можно скармливать `client/publish-release.sh` (шаг 5 выше).

Подробности — в `client/fork/README.md`: что именно кладётся в форк, как
подключить подпись через секреты и как обновлять workflow при выходе новой
версии RustDesk.

Локальная сборка по шагам 1–4 остаётся рабочей и нужна, когда правку хочется
проверить до выпуска.

## Частые ошибки

| Симптом | Причина |
|---|---|
| Скрипт правок останавливается с «не найдена точка вставки» | вышла новая версия RustDesk, изменился код — поправьте якорь в `client/patches/brand-client.py` |
| Сборка падает на `libvpx`/`aom` | не задан `VCPKG_ROOT` или библиотеки собраны не под ту архитектуру |
| Клиент не видит сервер | не подставился ключ: проверьте `--public-key` и «Настройки → Сеть» в клиенте |
| Нет карточки тарифа | клиент не достучался до `/api/v1/client/state`: проверьте `api-server` и доступность сайта |
| Обновления не предлагаются | сборка старее опубликованного выпуска или `enable-check-update` выключен политикой |
