-- Схема данных RemIT: аккаунты, подписки, платежи и учёт времени сессий.
-- Применяется автоматически при старте приложения с DATABASE_URL.

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);

-- Устройства с установленным клиентом. user_id пустой, пока устройство
-- не привязано к аккаунту в личном кабинете.
CREATE TABLE IF NOT EXISTS devices (
    id           TEXT PRIMARY KEY,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    rustdesk_id  TEXT NOT NULL UNIQUE,
    uuid         TEXT NOT NULL DEFAULT '',
    name         TEXT NOT NULL DEFAULT '',
    os           TEXT NOT NULL DEFAULT '',
    version      TEXT NOT NULL DEFAULT '',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan        TEXT NOT NULL,
    status      TEXT NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    auto_renew  BOOLEAN NOT NULL DEFAULT false,
    provider    TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL DEFAULT '',
    -- Персональный лимит одновременных сессий для корпоративных клиентов.
    concurrent_sessions INTEGER
);

-- Для баз, созданных до появления корпоративного тарифа.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS concurrent_sessions INTEGER;

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS payments (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan                TEXT NOT NULL,
    months              INTEGER NOT NULL DEFAULT 1,
    amount              BIGINT NOT NULL,
    status              TEXT NOT NULL,
    provider            TEXT NOT NULL,
    provider_payment_id TEXT NOT NULL DEFAULT '',
    confirmation_url    TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_provider_idx ON payments(provider_payment_id);

-- Сессии удалённого управления. Ключ: <id управляемого устройства>:<conn_id>.
CREATE TABLE IF NOT EXISTS conn_sessions (
    key           TEXT PRIMARY KEY,
    host_id       TEXT NOT NULL,
    conn_id       INTEGER NOT NULL,
    controller_id TEXT NOT NULL DEFAULT '',
    subject_key   TEXT NOT NULL,
    user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_tick_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ,
    seconds       INTEGER NOT NULL DEFAULT 0,
    close_reason  TEXT
);

CREATE INDEX IF NOT EXISTS conn_sessions_host_idx ON conn_sessions(host_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS conn_sessions_subject_idx ON conn_sessions(subject_key, started_at DESC);

-- Суточный расход времени. subject_key: user:<id> или device:<rustdesk_id>.
CREATE TABLE IF NOT EXISTS usage_daily (
    subject_key TEXT NOT NULL,
    day         DATE NOT NULL,
    seconds     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (subject_key, day)
);

-- Настройки, изменяемые из админки без перезапуска приложения.
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Выпуски клиента: их раздаёт сервер обновлений.
CREATE TABLE IF NOT EXISTS releases (
    id           TEXT PRIMARY KEY,
    version      TEXT NOT NULL,
    channel      TEXT NOT NULL DEFAULT 'stable',
    notes        TEXT NOT NULL DEFAULT '',
    mandatory    BOOLEAN NOT NULL DEFAULT false,
    published    BOOLEAN NOT NULL DEFAULT false,
    files        JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS releases_version_channel_idx ON releases(version, channel);

-- Заявки с сайта: пробный период для компаний и обращения.
CREATE TABLE IF NOT EXISTS leads (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL DEFAULT 'trial',
    name       TEXT NOT NULL DEFAULT '',
    company    TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    devices    TEXT NOT NULL DEFAULT '',
    comment    TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'new',
    note       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email, created_at DESC);

-- Обращения в поддержку от зарегистрированных пользователей.
-- Почта и имя не хранятся: они берутся из аккаунта по user_id.
CREATE TABLE IF NOT EXISTS support_tickets (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject     TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'new',
    answer      TEXT NOT NULL DEFAULT '',
    -- Снимки экрана: имя, адрес, размер и тип. Файлы лежат на диске.
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, created_at DESC);

-- Схема применяется при каждом старте, поэтому добавленные позже столбцы
-- дописываем отдельно: CREATE TABLE IF NOT EXISTS уже созданную не тронет.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
