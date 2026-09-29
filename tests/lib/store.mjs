// Чтение хранилища сайта из теста: JSON-файл MemoryStore (STORE_FILE) или
// Postgres (DATABASE_URL). Имена полей — как в снимке MemoryStore, поэтому
// один и тот же тест проверяет оба хранилища.
import fs from 'node:fs'
import { createRequire } from 'node:module'

const DATABASE_URL = process.env.DATABASE_URL ?? ''
const STORE_FILE = process.env.STORE_FILE ?? ''
let pool = null

function getPool() {
  if (!pool) {
    const { Pool } = createRequire(import.meta.url)('pg')
    // allowExitOnIdle: тест завершается сам, не дожидаясь закрытия пула.
    pool = new Pool({ connectionString: DATABASE_URL, max: 2, allowExitOnIdle: true })
  }
  return pool
}

const camel = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_(.)/g, (_, char) => char.toUpperCase()),
      value instanceof Date ? value.toISOString() : value,
    ]),
  )

// Коллекция снимка → запрос к Postgres.
const TABLES = {
  users: 'users',
  authSessions: 'auth_sessions',
  passwordResets: 'password_resets',
  devices: 'devices',
  clientTokens: 'client_tokens',
  addressBooks: 'address_books',
  fileAudits: 'file_audits ORDER BY created_at DESC',
  subscriptions: 'subscriptions',
  payments: 'payments',
  connSessions: 'conn_sessions',
  usage: 'usage_daily',
  oauthIdentities: 'oauth_identities',
  teams: 'teams',
  teamMembers: 'team_members',
  deviceGroups: 'device_groups',
  alarms: 'client_alarms',
  webShares: 'web_shares',
  incidents: 'incidents',
  monitorEvents: 'monitor_events',
}

export const usingPostgres = () => Boolean(DATABASE_URL)

/** Снимок хранилища. */
export async function readStore() {
  if (!DATABASE_URL) return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
  const db = getPool()
  const snapshot = {}
  for (const [name, table] of Object.entries(TABLES)) {
    snapshot[name] = (await db.query(`SELECT * FROM ${table}`)).rows.map(camel)
  }
  snapshot.payments = snapshot.payments.map((payment) => ({ ...payment, amount: Number(payment.amount) }))
  const settings = (await db.query('SELECT key, value FROM settings')).rows
  snapshot.settings = Object.fromEntries(settings.map((row) => [row.key, row.value]))
  return snapshot
}

/**
 * Правка «со стороны» — только поля, которые тестам нужно сдвигать во
 * времени: сроки подписок и платежей. MemoryStore перечитает файл по mtime.
 */
export async function editStore(mutate) {
  const snapshot = await readStore()
  const before = JSON.parse(JSON.stringify(snapshot))
  mutate(snapshot)
  if (!DATABASE_URL) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(snapshot, null, 2))
  } else {
    const db = getPool()
    for (const sub of snapshot.subscriptions) {
      const old = before.subscriptions.find((item) => item.id === sub.id)
      if (old && (old.expiresAt !== sub.expiresAt || old.renewNextAt !== sub.renewNextAt)) {
        await db.query('UPDATE subscriptions SET expires_at = $2, renew_next_at = $3 WHERE id = $1', [sub.id, sub.expiresAt, sub.renewNextAt])
      }
    }
    for (const payment of snapshot.payments) {
      const old = before.payments.find((item) => item.id === payment.id)
      if (old && old.serviceEndsAt !== payment.serviceEndsAt) {
        await db.query('UPDATE payments SET service_ends_at = $2 WHERE id = $1', [payment.id, payment.serviceEndsAt])
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 30))
}

export async function closeStore() {
  if (pool) await pool.end()
}

/** Прямой запрос к Postgres (для подготовки данных, которых не создать через API). */
export async function sql(query, params = []) {
  return (await getPool().query(query, params)).rows
}
