# Сборка фирменного клиента в форке rustdesk/rustdesk

Здесь лежит всё, что кладётся в форк RustDesk, чтобы сборка Windows / macOS /
Linux шла в GitHub Actions, а не на своей машине.

## Почему форк, а не этот репозиторий

* У публичного репозитория минуты Actions бесплатны и не лимитированы, у
  приватного — 2000 минут в месяц, причём Windows считается ×2, macOS ×10.
  Полная сборка трёх систем в приватном репозитории съедает месячный лимит
  за один прогон.
* Форк легко подтягивает новые версии RustDesk: `git fetch upstream` и ветка
  переставляется на свежий тег.
* AGPL-3.0 требует отдавать исходники клиента — публичный форк закрывает это
  требование сам по себе.

## Что кладётся в форк

| Путь в форке | Что это |
| --- | --- |
| `.github/workflows/remit-build.yml` | Сборка Windows x86_64, macOS x86_64/aarch64, Linux x86_64 |
| `remit/apply-branding.sh` | Накатывает наши правки сразу после checkout |
| `remit/patches/` | `brand-client.py` и виджет `remit_status.dart` |
| `remit/brand/` | Иконки и логотипы |
| `.build-trigger` | Запуск сборки: меняется — идёт прогон |

Исходники апстрима в форке остаются нетронутыми: брендирование выполняется во
время сборки. Поэтому переход на новую версию RustDesk — это `git checkout -B
remit tags/<новая версия>` и повторный `sync-fork.sh`, без разбора
конфликтов.

## Как этим пользоваться

```bash
# один раз: форкнуть rustdesk/rustdesk на GitHub и склонировать форк
git clone https://github.com/<логин>/rustdesk.git ~/rustdesk-fork

# каждый раз, когда меняются патчи или нужна новая версия RustDesk
bash client/sync-fork.sh --fork ~/rustdesk-fork --tag 1.4.9 --push
```

Дальше в настройках форка на GitHub:

1. Вкладка **Actions** — согласиться включить workflow'ы форка.
2. **Settings → Secrets and variables → Actions → Variables**:

   | Переменная | Значение | Обязательна |
   | --- | --- | --- |
   | `REMIT_PUBLIC_KEY` | открытый ключ hbbs (`id_ed25519.pub`) | да |
   | `REMIT_SITE` | `https://remit.su` | нет |
   | `REMIT_APP_NAME` | `RemIT` | нет |
   | `REMIT_ID_SERVER` | `remit.su` | нет |
   | `REMIT_RELAY_SERVER` | `remit.su` | нет |

   Ключ сервера не секрет: он и так лежит в каждом клиенте, поэтому его можно
   держать в Variables. Если хочется — положите в Secrets под тем же именем,
   workflow проверяет оба места.

3. **Сделать `remit` веткой по умолчанию**: Settings → General → Default
   branch. Без этого кнопки «Run workflow» не будет: GitHub показывает ручной
   запуск только для workflow'ов из ветки по умолчанию.

4. **Actions → «RemIT — сборка клиента» → Run workflow**, ветка `remit`.
   Галочками выбираются системы: можно собрать только Windows, только macOS и
   так далее.

   Если менять ветку по умолчанию не хочется, сборку запускает файл
   `.build-trigger` в ветке `remit`:

   ```bash
   bash client/sync-fork.sh --fork ~/rustdesk-fork --build test --push
   ```

   `--build test` собирает клиент без ключа сервера, только посмотреть;
   `--build release` — рабочий клиент, для него нужна переменная
   `REMIT_PUBLIC_KEY`. Собираются все три системы сразу. Остальные правки
   в ветке сборку не запускают — только изменение `.build-trigger`.

Готовые файлы лежат в артефактах прогона и в черновом релизе форка с тегом из
поля «Тег черновика релиза» (по умолчанию `remit`):

```
rustdesk-1.4.9-x86_64.exe    rustdesk-1.4.9-x86_64.msi
rustdesk-1.4.9-x86_64.dmg    rustdesk-1.4.9-aarch64.dmg
rustdesk-1.4.9-x86_64.deb    rustdesk-1.4.9-x86_64.rpm
rustdesk-1.4.9-x86_64.AppImage
```

Имена совпадают с тем, что ожидает встроенный автообновлятор клиента, поэтому
их можно сразу отдавать в `client/publish-release.sh`.

## Подпись

Workflow собирает неподписанные файлы. Подпись подключается так же, как в
апстриме, через секреты форка:

* Windows — `SIGN_BASE_URL` и `SIGN_SECRET_KEY` (свой сервис подписи) либо
  подписывайте скачанные файлы локально через `signtool`;
* macOS — `MACOS_P12_BASE64`, `MACOS_P12_PASSWORD`, `MACOS_CODESIGN_IDENTITY`,
  `MACOS_NOTARIZE_JSON`; при их наличии шаги подписи и нотаризации включаются
  сами.

Без подписи Windows покажет SmartScreen, а macOS — Gatekeeper.

## Как обновляется сам workflow

`remit-build.yml` получен из апстримного `.github/workflows/flutter-build.yml`
скриптом `client/fork/gen-workflow.py`: из него вырезаны Android, iOS, Web,
Sciter, Flatpak и arm-варианты, а после checkout добавлен вызов
`remit/apply-branding.sh`. Когда выйдет новая версия RustDesk:

```bash
# 1. поставить форк на новый тег, чтобы читать свежий апстримный workflow
git -C ~/rustdesk-fork fetch upstream refs/tags/1.5.0:refs/tags/1.5.0
git -C ~/rustdesk-fork checkout -B remit tags/1.5.0

# 2. пересобрать наш workflow из апстримного
python3 client/fork/gen-workflow.py \
    ~/rustdesk-fork/.github/workflows/flutter-build.yml \
    client/fork/workflows/remit-build.yml

# 3. разложить обвязку и отправить ветку
bash client/sync-fork.sh --fork ~/rustdesk-fork --push
```

Скрипт падает с ошибкой, если апстрим поменял структуру — это сигнал, что
правки надо пересмотреть, а не собирать вслепую.
