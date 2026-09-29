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

-- active | blocked | deleted (удалён по просьбе владельца, данные стёрты).
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
-- Подтверждение почты: до него оплата недоступна.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS email_verifications (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_verifications_user_idx ON email_verifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);

-- Одноразовые ссылки для сброса пароля. Хранится только хеш токена.
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id, created_at DESC);


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

-- Сведения о системе из клиента (/api/sysinfo) и адрес последнего выхода на связь.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS os_username TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cpu TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS memory TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sysinfo_at TIMESTAMPTZ;
-- Группа устройств команды.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS group_id TEXT;

-- Входы в клиенте RemIT. Храним хеш токена; отозванные записи остаются
-- журналом входов.
CREATE TABLE IF NOT EXISTS client_tokens (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id    TEXT NOT NULL DEFAULT '',
    uuid         TEXT NOT NULL DEFAULT '',
    device_name  TEXT NOT NULL DEFAULT '',
    os           TEXT NOT NULL DEFAULT '',
    ip           TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);

-- Гостевые токены веб-клиента: только одно устройство, без доступа к API.
ALTER TABLE client_tokens ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'full';
ALTER TABLE client_tokens ADD COLUMN IF NOT EXISTS peer_id TEXT NOT NULL DEFAULT '';
ALTER TABLE client_tokens ADD COLUMN IF NOT EXISTS share_token TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS client_tokens_user_idx ON client_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_tokens_created_idx ON client_tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS client_tokens_device_idx ON client_tokens(device_id) WHERE revoked_at IS NULL;

-- Адресные книги клиента. Записи, метки и доступы — одним документом:
-- книга читается и меняется целиком, а размер у неё небольшой.
CREATE TABLE IF NOT EXISTS address_books (
    guid       TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT '',
    personal   BOOLEAN NOT NULL DEFAULT false,
    note       TEXT NOT NULL DEFAULT '',
    peers      JSONB NOT NULL DEFAULT '[]',
    tags       JSONB NOT NULL DEFAULT '[]',
    shares     JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS address_books_owner_idx ON address_books(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS address_books_personal_idx ON address_books(owner_id) WHERE personal;
CREATE INDEX IF NOT EXISTS address_books_shares_idx ON address_books USING GIN (shares jsonb_path_ops);

-- Журнал передачи файлов из клиента (/api/audit/file).
CREATE TABLE IF NOT EXISTS file_audits (
    id              TEXT PRIMARY KEY,
    host_id         TEXT NOT NULL,
    controller_id   TEXT NOT NULL DEFAULT '',
    controller_name TEXT NOT NULL DEFAULT '',
    ip              TEXT NOT NULL DEFAULT '',
    type            INTEGER NOT NULL DEFAULT 0,
    path            TEXT NOT NULL DEFAULT '',
    is_file         BOOLEAN NOT NULL DEFAULT false,
    num             INTEGER NOT NULL DEFAULT 0,
    files           JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_audits_host_idx ON file_audits(host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS file_audits_created_idx ON file_audits(created_at DESC);

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

-- Автопродление: сохранённый в ЮKassa способ оплаты и попытки списания.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method_id TEXT NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method_title TEXT NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renew_months INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renew_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renew_next_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renew_notice_for TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renew_error TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS subscriptions_renew_idx ON subscriptions(expires_at) WHERE auto_renew AND status = 'active';

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

-- Доплата за повышение тарифа до конца текущей подписки. Столбцы добавлены
-- позже, поэтому отдельными ALTER: схема применяется при каждом старте.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'subscription';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS from_plan TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS upgrade_until TIMESTAMPTZ;

-- Автопродление и чеки по 54-ФЗ.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recurring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS save_method BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotence_key TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_email TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS service_ends_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS settlement TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipts JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunds JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_settlement_idx ON payments(service_ends_at) WHERE settlement = 'due';
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

-- Кто подключался и откуда — из аудита клиента.
ALTER TABLE conn_sessions ADD COLUMN IF NOT EXISTS controller_name TEXT NOT NULL DEFAULT '';
ALTER TABLE conn_sessions ADD COLUMN IF NOT EXISTS ip TEXT NOT NULL DEFAULT '';
ALTER TABLE conn_sessions ADD COLUMN IF NOT EXISTS conn_type INTEGER;

CREATE INDEX IF NOT EXISTS conn_sessions_host_idx ON conn_sessions(host_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS conn_sessions_subject_idx ON conn_sessions(subject_key, started_at DESC);
-- История подключений к устройствам аккаунта и очистка по сроку хранения.
CREATE INDEX IF NOT EXISTS conn_sessions_host_started_idx ON conn_sessions(host_id, started_at DESC);
CREATE INDEX IF NOT EXISTS conn_sessions_started_idx ON conn_sessions(started_at);

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

-- Вход через VK ID: какой профиль привязан к какому аккаунту.
CREATE TABLE IF NOT EXISTS oauth_identities (
    provider   TEXT NOT NULL,
    subject    TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_identities_user_idx ON oauth_identities(provider, user_id);

-- Незавершённые входы через VK ID (живут 10 минут).
CREATE TABLE IF NOT EXISTS oauth_states (
    state      TEXT PRIMARY KEY,
    data       JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Команды: сотрудники видят устройства друг друга. Один аккаунт — одна команда.
CREATE TABLE IF NOT EXISTS teams (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
    team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS device_groups (
    id         TEXT PRIMARY KEY,
    team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_groups_team_idx ON device_groups(team_id);

-- Тревоги клиента (/api/audit/alarm).
CREATE TABLE IF NOT EXISTS client_alarms (
    id         TEXT PRIMARY KEY,
    host_id    TEXT NOT NULL,
    type       INTEGER NOT NULL DEFAULT 0,
    info       TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_alarms_host_idx ON client_alarms(host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_alarms_created_idx ON client_alarms(created_at DESC);

-- Ссылки для гостей на подключение через веб-клиент.
CREATE TABLE IF NOT EXISTS web_shares (
    token           TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_id         TEXT NOT NULL,
    password_type   TEXT NOT NULL DEFAULT 'once',
    password_secret TEXT NOT NULL,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_shares_user_idx ON web_shares(user_id, created_at DESC);

-- Мониторинг: суточная доступность проверок и компонентов страницы статуса.
CREATE TABLE IF NOT EXISTS monitor_days (
    key   TEXT NOT NULL,
    day   TEXT NOT NULL,
    ok    INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, day)
);

-- Смены состояния проверок (упала, восстановилась).
CREATE TABLE IF NOT EXISTS monitor_events (
    id       TEXT PRIMARY KEY,
    check_id TEXT NOT NULL,
    at       TIMESTAMPTZ NOT NULL,
    status   TEXT NOT NULL,
    detail   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS monitor_events_at_idx ON monitor_events(at DESC);

-- Инциденты и плановые работы на странице статуса.
CREATE TABLE IF NOT EXISTS incidents (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    impact      TEXT NOT NULL,
    status      TEXT NOT NULL,
    components  JSONB NOT NULL DEFAULT '[]'::jsonb,
    auto        BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    starts_at   TIMESTAMPTZ,
    ends_at     TIMESTAMPTZ,
    updates     JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS incidents_open_idx ON incidents(created_at DESC) WHERE resolved_at IS NULL;
