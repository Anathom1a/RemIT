/**
 * Единая точка чтения окружения. Значения по умолчанию рассчитаны на локальный
 * запуск без внешних сервисов: витрина и кабинет работают сразу после `npm run dev`.
 */

function env(name: string, fallback = ''): string {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  /** Публичное имя продукта. Меняется в одном месте при ребрендинге. */
  brand: {
    name: env('REMIT_BRAND', 'RemIT'),
    latinName: env('REMIT_BRAND_LATIN', 'RemIT'),
    domain: env('REMIT_DOMAIN', 'remit.su'),
    supportUrl: env('REMIT_SUPPORT_URL', 'https://t.me/Mrdikpic'),
    supportEmail: env('REMIT_SUPPORT_EMAIL', 'support@remit.su'),
    /** Почта отдела продаж: заявки компаний и счета. */
    salesEmail: env('REMIT_SALES_EMAIL', 'sales@remit.su'),
    /** Город и регион присутствия — сигнал для поиска и карточки организации. */
    city: env('REMIT_CITY', 'Москва'),
  },

  /** Адреса инфраструктуры RustDesk, которые показываем в клиенте и кабинете. */
  rustdesk: {
    idServer: env('REMIT_ID_SERVER', 'remit.su:21116'),
    relayServer: env('REMIT_RELAY_SERVER', 'remit.su:21117'),
    apiServer: env('REMIT_API_SERVER', 'https://remit.su'),
    publicKey: env('REMIT_PUBLIC_KEY', ''),
    /** Внутренний адрес панели lejianwen/rustdesk-api, куда проксируем шлюз. */
    upstream: env('RUSTDESK_API_UPSTREAM', 'http://127.0.0.1:21114'),
  },

  /** Учёт времени. Сутки бесплатного тарифа считаются по московскому времени. */
  quota: {
    timeZone: env('REMIT_TZ', 'Europe/Moscow'),
    /** Бесплатный лимит: 3 часа в сутки. */
    freeSecondsPerDay: envInt('REMIT_FREE_SECONDS_PER_DAY', 3 * 60 * 60),
    /** Максимальный шаг учёта между heartbeat-ами, защита от «прыжков» времени. */
    maxTickSeconds: envInt('REMIT_MAX_TICK_SECONDS', 30),
    /** Сессия считается мёртвой, если heartbeat не приходил дольше этого времени. */
    staleSessionSeconds: envInt('REMIT_STALE_SESSION_SECONDS', 90),
    /** Предупреждения в клиенте и кабинете, секунды до конца лимита. */
    warnAtSeconds: [30 * 60, 10 * 60, 60],
  },

  auth: {
    /** Секрет для подписи cookie-сессий и сервисных токенов. */
    secret: env('REMIT_AUTH_SECRET', 'dev-secret-change-me'),
    sessionTtlSeconds: envInt('REMIT_SESSION_TTL', 30 * 24 * 60 * 60),
    cookieName: 'remit_session',
    /**
     * Флаг Secure у cookie сессии. По умолчанию включён в production.
     * Выключайте только для локальной проверки сборки по http.
     */
    cookieSecure: env('REMIT_COOKIE_SECURE', process.env.NODE_ENV === 'production' ? 'true' : 'false') === 'true',
  },

  /** Поисковая оптимизация и счётчики. */
  seo: {
    /** Код подтверждения прав в Яндекс.Вебмастере. */
    yandexVerification: env('REMIT_YANDEX_VERIFICATION'),
    /** Код подтверждения прав в Google Search Console. */
    googleVerification: env('REMIT_GOOGLE_VERIFICATION'),
    /** Номер счётчика Яндекс.Метрики; пусто — счётчик не подключается. */
    metrikaId: env('REMIT_YANDEX_METRIKA_ID'),
  },

  /** Уведомления о заявках: телеграм-бот вместо почты, пока её нет. */
  notifications: {
    telegramBotToken: env('REMIT_TELEGRAM_BOT_TOKEN'),
    telegramChatId: env('REMIT_TELEGRAM_CHAT_ID'),
  },

  /** Пробный период для компаний. */
  trial: {
    /** Максимальный срок, дни. На сайте пишем «до 30 дней». */
    maxDays: envInt('REMIT_TRIAL_MAX_DAYS', 30),
    /** Что выдаём по умолчанию при одобрении заявки. */
    defaultDays: envInt('REMIT_TRIAL_DEFAULT_DAYS', 14),
    defaultPlan: env('REMIT_TRIAL_PLAN', 'pro'),
  },

  /** Токен, которым hbbs и шлюз авторизуются во внутреннем API квот. */
  serviceToken: env('REMIT_SERVICE_TOKEN', 'dev-service-token'),

  admin: {
    /**
     * Почты, которым админка доступна всегда. Нужны, чтобы войти в неё сразу
     * после установки, когда роль admin ещё некому выдать.
     */
    emails: env('REMIT_ADMIN_EMAILS')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  },

  billing: {
    provider: env('REMIT_BILLING_PROVIDER', 'yookassa') as 'manual' | 'yookassa',
    yookassa: {
      shopId: env('YOOKASSA_SHOP_ID'),
      secretKey: env('YOOKASSA_SECRET_KEY'),
      returnUrl: env('YOOKASSA_RETURN_URL', 'https://remit.su/kabinet/podpiska'),
    },
  },

  storage: {
    /** Каталог, куда админка складывает загруженные сборки клиента. */
    releasesDir: env('REMIT_RELEASES_DIR', 'data/releases'),
    /** Максимальный размер одного файла сборки, байты. */
    maxUploadBytes: envInt('REMIT_MAX_UPLOAD_BYTES', 1024 * 1024 * 1024),
    /** Запасной вариант: раздача сборок из внешнего хранилища. */
    downloadsBase: env('REMIT_DOWNLOADS_BASE'),
  },

  database: {
    url: env('DATABASE_URL'),
    /** Путь к JSON-хранилищу для локальной разработки без Postgres. */
    file: env('REMIT_STORE_FILE', 'data/store.json'),
  },
} as const

export const isProduction = process.env.NODE_ENV === 'production'
