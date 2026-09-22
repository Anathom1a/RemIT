# Развёртывание

## Что понадобится

- сервер Ubuntu 22.04 или 24.04, 2 vCPU / 4 ГБ / 40 ГБ;
- домен `remit.su` с записями `A` на сервер (плюс `id.` и `relay.`, если
  сервер связи вынесен отдельно);
- открытые порты: `80`, `443`, `21115-21119/tcp`, `21116/udp`.

## Быстрый старт

```bash
git clone https://github.com/Anathom1a/RemIT.ru.git
cd RemIT.ru
sudo bash server/deploy.sh
```

Скрипт установит Docker, создаст `server/.env` со случайными секретами и
запустит четыре контейнера: `db`, `rustdesk`, `web`, `nginx`.

После первого запуска добавьте в `server/.env` публичный ключ сервера, который
выведет скрипт, и пересоздайте сайт:

```bash
cd server
docker compose --env-file .env up -d web
```

## TLS

```bash
docker run --rm \
  -v "$PWD/server/data/certbot/conf:/etc/letsencrypt" \
  -v "$PWD/server/data/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d remit.su -d www.remit.su --agree-tos -m admin@remit.su --no-eff-email
```

Продление — раз в сутки той же командой с `renew` и `docker compose exec nginx nginx -s reload`.

## Оплата

Заполните в `server/.env`:

```env
REMIT_BILLING_PROVIDER=yookassa
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
```

и укажите адрес уведомлений в личном кабинете ЮKassa:
`https://remit.su/api/v1/billing/webhook/yookassa`. Подробно — `docs/BILLING.md`.

## Свой образ сервера с проверкой лимита

Патч `client/patches/hbbs-quota-hook.py` встраивается в `hbbs` при сборке
образа. Собрать образ можно двумя способами.

### На самом сервере (не требует GitHub Actions)

```bash
sudo bash server/build-image.sh
```

Скрипт забирает исходники панели и сервера, накатывает патч лимита и собирает
образ. Node, Go и Rust на машину ставить не нужно: каждый шаг выполняется в
официальном образе, из инструментов нужен только Docker. Готовый образ
получает тег `remit/rustdesk-server-s6:latest` — его и пропишите в
`server/.env`:

```env
RUSTDESK_IMAGE=remit/rustdesk-server-s6:latest
```

```bash
cd server && docker compose --env-file .env up -d rustdesk
```

### В GitHub Actions

`.github/workflows/build-server-image.yml` делает то же самое и публикует
образ в приватный GHCR. Учтите: репозиторий приватный, а значит минуты Actions
у него ограничены тарифом — при исчерпанном лимите задача падает за пару
секунд, не получив раннера, и без логов. Тогда собирайте образ на сервере
способом выше.

После публикации в GHCR пропишите образ и авторизуйте сервер в реестре
токеном с правом `read:packages`:

```env
RUSTDESK_IMAGE=ghcr.io/anathom1a/rustdesk-server-s6-remit:latest
```

```bash
docker login ghcr.io -u ВАШ_ЛОГИН
cd server && docker compose --env-file .env up -d rustdesk
```

## Локальная разработка

Без Docker и без базы данных:

```bash
npm install
npm run dev
```

Сайт поднимется на `http://localhost:3000`, данные лягут в `data/store.json`.
Учёт квот и оплату можно проверять запросами к `/api/heartbeat` и `/api/v1/*`.

Полезные переменные для проверки лимита:

```bash
REMIT_FREE_SECONDS_PER_DAY=60 \
REMIT_SERVICE_TOKEN=dev-token \
npm run dev
```

## Обслуживание

```bash
cd server
docker compose ps                  # состояние
docker compose logs -f web         # логи сайта и учёта квот
docker compose logs -f rustdesk    # логи hbbs, hbbr и панели
docker compose pull && docker compose up -d   # обновление
```

Резервные копии — каталог `server/data`: база, ключи сервера и данные панели.
Ключ `data/rustdesk/id_ed25519` восстановлению не подлежит: при его потере все
собранные клиенты перестанут доверять серверу.
