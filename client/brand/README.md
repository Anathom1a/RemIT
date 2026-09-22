# Оформление клиента RemIT

Здесь лежат готовые иконки и логотипы. Они попадают в сборку сами:
`client/patches/brand-client.py` разносит их по дереву RustDesk (таблица
`BRAND_ASSETS`), заменяя все иконки RustDesk.

## Знак

Дуга «С» (связь) вокруг экрана (desk). Палитра — с сайта: подложка `#0B101C`,
градиент знака `#5F9BFF → #2FD8E6`, экран `#E9EEFB`. Тёмная подложка выбрана
намеренно: так иконка не путается с RustDesk и совпадает с тёмным сайтом.

## Файлы

| Файл | Куда идёт |
| --- | --- |
| `icon.png` (1024) | `res/icon.png`, `flutter/assets/icon.png` |
| `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` | `res/` — иконки Linux |
| `icon.ico` | `res/icon.ico`, `flutter/windows/runner/resources/app_icon.ico` |
| `tray-icon.ico` | `res/tray-icon.ico` — значок в трее Windows |
| `mac-icon.png` | `res/mac-icon.png` |
| `AppIcon.icns` | `flutter/macos/Runner/AppIcon.icns` |
| `mac-tray-dark-x2.png`, `mac-tray-light-x2.png` | строка меню macOS |
| `icon.svg` | `flutter/assets/icon.svg`, `res/logo.svg`, `res/logo-header.svg` |
| `scalable.svg` | `res/scalable.svg` — иконка Linux в векторе |
| `logo.png` | `flutter/assets/logo.png` — шапка главного окна |
| `android/mipmap-*/` | иконки приложения на Android |

`logo.png` нарисован на тёмной скруглённой плашке: главное окно RustDesk бывает
и светлым, и тёмным, а плашка читается в обеих темах.

## Перерисовать

```bash
python3 client/brand/generate-brand.py
```

Скрипт рисует всё заново из кода — иконки, логотип, `.ico`, `.icns`, векторы и
набор для Android. Шрифт надписи подбирается из системных и проверяется на
кириллицу: большинство модных гротесков её не содержат и молча рисуют квадраты.

Размеры и пропорции знака заданы долями в начале функций `two_tone_mark` и
`app_icon` — менять оформление удобнее там, а не в готовых файлах.
