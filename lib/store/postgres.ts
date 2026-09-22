import fs from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import type { Store } from './index'
import type {
  AuthSession,
  ConnSession,
  Device,
  Lead,
  SupportTicket,
  Payment,
  Release,
  Subscription,
  UsageDay,
  User,
} from '../types'
import type { PlanId } from '../plans'
import type { PaymentStatus, SubscriptionStatus } from '../types'

type Row = Record<string, any>

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : value

/** Рабочее хранилище на Postgres. Схема лежит в server/sql/001_init.sql. */
export class PostgresStore implements Store {
  private pool!: Pool

  constructor(private readonly url: string) {}

  async init(): Promise<void> {
    const { Pool } = await import('pg')
    this.pool = new Pool({ connectionString: this.url, max: 10 })
    const schemaPath = path.resolve('server/sql/001_init.sql')
    const schema = await fs.readFile(schemaPath, 'utf8')
    await this.pool.query(schema)
  }

  private async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(text, params as any[])
    return result.rows as T[]
  }

  private toUser(row: Row): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      role: row.role,
      createdAt: iso(row.created_at)!,
    }
  }

  private toDevice(row: Row): Device {
    return {
      id: row.id,
      userId: row.user_id,
      rustdeskId: row.rustdesk_id,
      uuid: row.uuid,
      name: row.name,
      os: row.os,
      version: row.version,
      lastSeenAt: iso(row.last_seen_at)!,
      createdAt: iso(row.created_at)!,
    }
  }

  private toSubscription(row: Row): Subscription {
    return {
      id: row.id,
      userId: row.user_id,
      plan: row.plan as PlanId,
      status: row.status as SubscriptionStatus,
      startedAt: iso(row.started_at)!,
      expiresAt: iso(row.expires_at)!,
      autoRenew: row.auto_renew,
      provider: row.provider,
      providerId: row.provider_id,
      concurrentSessions: row.concurrent_sessions ?? null,
    }
  }

  private toPayment(row: Row): Payment {
    return {
      id: row.id,
      userId: row.user_id,
      plan: row.plan as PlanId,
      months: row.months,
      amount: Number(row.amount),
      status: row.status as PaymentStatus,
      provider: row.provider,
      providerPaymentId: row.provider_payment_id,
      confirmationUrl: row.confirmation_url,
      createdAt: iso(row.created_at)!,
      paidAt: iso(row.paid_at),
    }
  }

  private toConnSession(row: Row): ConnSession {
    return {
      key: row.key,
      hostId: row.host_id,
      connId: row.conn_id,
      controllerId: row.controller_id,
      subjectKey: row.subject_key,
      userId: row.user_id,
      startedAt: iso(row.started_at)!,
      lastTickAt: iso(row.last_tick_at)!,
      endedAt: iso(row.ended_at),
      seconds: row.seconds,
      closeReason: row.close_reason,
    }
  }

  async createUser(user: User): Promise<void> {
    await this.query(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.email, user.name, user.passwordHash, user.role, user.createdAt],
    )
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const rows = await this.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()])
    return rows[0] ? this.toUser(rows[0]) : null
  }

  async findUserById(id: string): Promise<User | null> {
    const rows = await this.query('SELECT * FROM users WHERE id = $1', [id])
    return rows[0] ? this.toUser(rows[0]) : null
  }

  async updateUser(user: User): Promise<void> {
    await this.query(
      'UPDATE users SET email = $2, name = $3, password_hash = $4, role = $5 WHERE id = $1',
      [user.id, user.email, user.name, user.passwordHash, user.role],
    )
  }

  async listUsers(options: { query?: string; limit: number; offset: number }): Promise<{ users: User[]; total: number }> {
    const query = options.query?.trim().toLowerCase() ?? ''
    const where = query ? 'WHERE lower(email) LIKE $1 OR lower(name) LIKE $1' : ''
    const params: unknown[] = query ? [`%${query}%`] : []

    const totalRows = await this.query<{ count: string }>(`SELECT count(*)::text AS count FROM users ${where}`, params)
    const rows = await this.query(
      `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, options.limit, options.offset],
    )
    return { users: rows.map((row) => this.toUser(row)), total: Number(totalRows[0]?.count ?? 0) }
  }

  async createAuthSession(session: AuthSession): Promise<void> {
    await this.query(
      `INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [session.tokenHash, session.userId, session.createdAt, session.expiresAt],
    )
  }

  async findAuthSession(tokenHash: string): Promise<AuthSession | null> {
    const rows = await this.query(
      'SELECT * FROM auth_sessions WHERE token_hash = $1 AND expires_at > now()',
      [tokenHash],
    )
    const row = rows[0]
    if (!row) return null
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      createdAt: iso(row.created_at)!,
      expiresAt: iso(row.expires_at)!,
    }
  }

  async deleteAuthSession(tokenHash: string): Promise<void> {
    await this.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash])
  }

  async upsertDevice(device: Device): Promise<void> {
    await this.query(
      `INSERT INTO devices (id, user_id, rustdesk_id, uuid, name, os, version, last_seen_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (rustdesk_id) DO UPDATE SET
         uuid = COALESCE(NULLIF(EXCLUDED.uuid, ''), devices.uuid),
         name = COALESCE(NULLIF(EXCLUDED.name, ''), devices.name),
         os = COALESCE(NULLIF(EXCLUDED.os, ''), devices.os),
         version = COALESCE(NULLIF(EXCLUDED.version, ''), devices.version),
         user_id = COALESCE(EXCLUDED.user_id, devices.user_id),
         last_seen_at = EXCLUDED.last_seen_at`,
      [
        device.id,
        device.userId,
        device.rustdeskId,
        device.uuid,
        device.name,
        device.os,
        device.version,
        device.lastSeenAt,
        device.createdAt,
      ],
    )
  }

  async findDeviceByRustdeskId(rustdeskId: string): Promise<Device | null> {
    const rows = await this.query('SELECT * FROM devices WHERE rustdesk_id = $1', [rustdeskId])
    return rows[0] ? this.toDevice(rows[0]) : null
  }

  async listDevicesByUser(userId: string): Promise<Device[]> {
    const rows = await this.query('SELECT * FROM devices WHERE user_id = $1 ORDER BY last_seen_at DESC', [userId])
    return rows.map((row) => this.toDevice(row))
  }

  async setDeviceOwner(rustdeskId: string, userId: string | null): Promise<void> {
    await this.query('UPDATE devices SET user_id = $2 WHERE rustdesk_id = $1', [rustdeskId, userId])
  }

  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    const rows = await this.query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND status = 'active' AND expires_at > now()
       ORDER BY expires_at DESC LIMIT 1`,
      [userId],
    )
    return rows[0] ? this.toSubscription(rows[0]) : null
  }

  async saveSubscription(subscription: Subscription): Promise<void> {
    await this.query(
      `INSERT INTO subscriptions (id, user_id, plan, status, started_at, expires_at, auto_renew, provider, provider_id, concurrent_sessions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         plan = EXCLUDED.plan,
         status = EXCLUDED.status,
         expires_at = EXCLUDED.expires_at,
         auto_renew = EXCLUDED.auto_renew,
         provider = EXCLUDED.provider,
         provider_id = EXCLUDED.provider_id,
         concurrent_sessions = EXCLUDED.concurrent_sessions`,
      [
        subscription.id,
        subscription.userId,
        subscription.plan,
        subscription.status,
        subscription.startedAt,
        subscription.expiresAt,
        subscription.autoRenew,
        subscription.provider,
        subscription.providerId,
        subscription.concurrentSessions,
      ],
    )
  }

  async listActiveSubscriptions(): Promise<Subscription[]> {
    const rows = await this.query(
      `SELECT * FROM subscriptions WHERE status = 'active' AND expires_at > now() ORDER BY expires_at ASC`,
    )
    return rows.map((row) => this.toSubscription(row))
  }

  async createPayment(payment: Payment): Promise<void> {
    await this.savePayment(payment)
  }

  async savePayment(payment: Payment): Promise<void> {
    await this.query(
      `INSERT INTO payments (id, user_id, plan, months, amount, status, provider, provider_payment_id, confirmation_url, created_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         provider_payment_id = EXCLUDED.provider_payment_id,
         confirmation_url = EXCLUDED.confirmation_url,
         paid_at = EXCLUDED.paid_at`,
      [
        payment.id,
        payment.userId,
        payment.plan,
        payment.months,
        payment.amount,
        payment.status,
        payment.provider,
        payment.providerPaymentId,
        payment.confirmationUrl,
        payment.createdAt,
        payment.paidAt,
      ],
    )
  }

  async findPaymentById(id: string): Promise<Payment | null> {
    const rows = await this.query('SELECT * FROM payments WHERE id = $1', [id])
    return rows[0] ? this.toPayment(rows[0]) : null
  }

  async findPaymentByProviderId(providerPaymentId: string): Promise<Payment | null> {
    const rows = await this.query('SELECT * FROM payments WHERE provider_payment_id = $1', [providerPaymentId])
    return rows[0] ? this.toPayment(rows[0]) : null
  }

  async listPaymentsByUser(userId: string, limit: number): Promise<Payment[]> {
    const rows = await this.query(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    )
    return rows.map((row) => this.toPayment(row))
  }

  async listRecentPayments(limit: number): Promise<Payment[]> {
    const rows = await this.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT $1', [limit])
    return rows.map((row) => this.toPayment(row))
  }

  async listDevices(limit: number): Promise<Device[]> {
    const rows = await this.query('SELECT * FROM devices ORDER BY last_seen_at DESC LIMIT $1', [limit])
    return rows.map((row) => this.toDevice(row))
  }

  async getConnSession(key: string): Promise<ConnSession | null> {
    const rows = await this.query('SELECT * FROM conn_sessions WHERE key = $1', [key])
    return rows[0] ? this.toConnSession(rows[0]) : null
  }

  async saveConnSession(session: ConnSession): Promise<void> {
    await this.query(
      `INSERT INTO conn_sessions (key, host_id, conn_id, controller_id, subject_key, user_id, started_at, last_tick_at, ended_at, seconds, close_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (key) DO UPDATE SET
         controller_id = EXCLUDED.controller_id,
         subject_key = EXCLUDED.subject_key,
         user_id = EXCLUDED.user_id,
         last_tick_at = EXCLUDED.last_tick_at,
         ended_at = EXCLUDED.ended_at,
         seconds = EXCLUDED.seconds,
         close_reason = EXCLUDED.close_reason`,
      [
        session.key,
        session.hostId,
        session.connId,
        session.controllerId,
        session.subjectKey,
        session.userId,
        session.startedAt,
        session.lastTickAt,
        session.endedAt,
        session.seconds,
        session.closeReason,
      ],
    )
  }

  async listActiveConnSessions(filter: { hostId?: string; subjectKey?: string }): Promise<ConnSession[]> {
    const conditions = ['ended_at IS NULL']
    const params: unknown[] = []
    if (filter.hostId) {
      params.push(filter.hostId)
      conditions.push(`host_id = $${params.length}`)
    }
    if (filter.subjectKey) {
      params.push(filter.subjectKey)
      conditions.push(`subject_key = $${params.length}`)
    }
    const rows = await this.query(`SELECT * FROM conn_sessions WHERE ${conditions.join(' AND ')}`, params)
    return rows.map((row) => this.toConnSession(row))
  }

  async listRecentConnSessions(subjectKeys: string[], limit: number): Promise<ConnSession[]> {
    if (subjectKeys.length === 0) return []
    const rows = await this.query(
      'SELECT * FROM conn_sessions WHERE subject_key = ANY($1) ORDER BY started_at DESC LIMIT $2',
      [subjectKeys, limit],
    )
    return rows.map((row) => this.toConnSession(row))
  }

  async addUsage(subjectKey: string, day: string, seconds: number): Promise<UsageDay> {
    const rows = await this.query(
      `INSERT INTO usage_daily (subject_key, day, seconds)
       VALUES ($1, $2, $3)
       ON CONFLICT (subject_key, day) DO UPDATE SET seconds = usage_daily.seconds + EXCLUDED.seconds
       RETURNING seconds`,
      [subjectKey, day, Math.max(0, Math.round(seconds))],
    )
    return { subjectKey, day, seconds: rows[0]?.seconds ?? 0 }
  }

  async getUsage(subjectKey: string, day: string): Promise<UsageDay> {
    const rows = await this.query('SELECT seconds FROM usage_daily WHERE subject_key = $1 AND day = $2', [
      subjectKey,
      day,
    ])
    return { subjectKey, day, seconds: rows[0]?.seconds ?? 0 }
  }

  async resetUsage(subjectKey: string, day: string): Promise<void> {
    await this.query('DELETE FROM usage_daily WHERE subject_key = $1 AND day = $2', [subjectKey, day])
  }

  async sumUsage(day: string): Promise<{ seconds: number; subjects: number }> {
    const rows = await this.query<{ seconds: string; subjects: string }>(
      `SELECT coalesce(sum(seconds), 0)::text AS seconds, count(*)::text AS subjects
       FROM usage_daily WHERE day = $1`,
      [day],
    )
    return { seconds: Number(rows[0]?.seconds ?? 0), subjects: Number(rows[0]?.subjects ?? 0) }
  }

  async getSettings(): Promise<Record<string, string>> {
    const rows = await this.query<{ key: string; value: string }>('SELECT key, value FROM settings')
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value],
    )
  }

  private toRelease(row: Row): Release {
    return {
      id: row.id,
      version: row.version,
      channel: row.channel,
      notes: row.notes,
      mandatory: row.mandatory,
      published: row.published,
      files: typeof row.files === 'string' ? JSON.parse(row.files) : (row.files ?? []),
      createdAt: iso(row.created_at)!,
      publishedAt: iso(row.published_at),
    }
  }

  async listReleases(): Promise<Release[]> {
    const rows = await this.query('SELECT * FROM releases ORDER BY created_at DESC')
    return rows.map((row) => this.toRelease(row))
  }

  async findRelease(id: string): Promise<Release | null> {
    const rows = await this.query('SELECT * FROM releases WHERE id = $1', [id])
    return rows[0] ? this.toRelease(rows[0]) : null
  }

  async saveRelease(release: Release): Promise<void> {
    await this.query(
      `INSERT INTO releases (id, version, channel, notes, mandatory, published, files, created_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         version = EXCLUDED.version,
         channel = EXCLUDED.channel,
         notes = EXCLUDED.notes,
         mandatory = EXCLUDED.mandatory,
         published = EXCLUDED.published,
         files = EXCLUDED.files,
         published_at = EXCLUDED.published_at`,
      [
        release.id,
        release.version,
        release.channel,
        release.notes,
        release.mandatory,
        release.published,
        JSON.stringify(release.files),
        release.createdAt,
        release.publishedAt,
      ],
    )
  }

  async deleteRelease(id: string): Promise<void> {
    await this.query('DELETE FROM releases WHERE id = $1', [id])
  }

  private toLead(row: Row): Lead {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      company: row.company,
      email: row.email,
      phone: row.phone,
      devices: row.devices,
      comment: row.comment,
      status: row.status,
      note: row.note,
      createdAt: iso(row.created_at)!,
      handledAt: iso(row.handled_at),
    }
  }

  async createLead(lead: Lead): Promise<void> {
    await this.saveLead(lead)
  }

  async saveLead(lead: Lead): Promise<void> {
    await this.query(
      `INSERT INTO leads (id, kind, name, company, email, phone, devices, comment, status, note, created_at, handled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         note = EXCLUDED.note,
         handled_at = EXCLUDED.handled_at`,
      [
        lead.id,
        lead.kind,
        lead.name,
        lead.company,
        lead.email,
        lead.phone,
        lead.devices,
        lead.comment,
        lead.status,
        lead.note,
        lead.createdAt,
        lead.handledAt,
      ],
    )
  }

  async listLeads(limit: number): Promise<Lead[]> {
    const rows = await this.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT $1', [limit])
    return rows.map((row) => this.toLead(row))
  }

  async findLead(id: string): Promise<Lead | null> {
    const rows = await this.query('SELECT * FROM leads WHERE id = $1', [id])
    return rows[0] ? this.toLead(rows[0]) : null
  }

  async countRecentLeads(email: string, since: string): Promise<number> {
    const rows = await this.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM leads WHERE email = $1 AND created_at >= $2',
      [email.trim().toLowerCase(), since],
    )
    return Number(rows[0]?.count ?? 0)
  }

  async createTicket(ticket: SupportTicket): Promise<void> {
    await this.saveTicket(ticket)
  }

  async saveTicket(ticket: SupportTicket): Promise<void> {
    await this.query(
      `INSERT INTO support_tickets (id, user_id, subject, message, status, answer, created_at, updated_at, answered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         answer = EXCLUDED.answer,
         updated_at = EXCLUDED.updated_at,
         answered_at = EXCLUDED.answered_at`,
      [
        ticket.id,
        ticket.userId,
        ticket.subject,
        ticket.message,
        ticket.status,
        ticket.answer,
        ticket.createdAt,
        ticket.updatedAt,
        ticket.answeredAt,
      ],
    )
  }

  async findTicket(id: string): Promise<SupportTicket | null> {
    const rows = await this.query('SELECT * FROM support_tickets WHERE id = $1', [id])
    return rows[0] ? this.toTicket(rows[0]) : null
  }

  async listTickets(limit: number): Promise<SupportTicket[]> {
    const rows = await this.query('SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT $1', [
      limit,
    ])
    return rows.map((row) => this.toTicket(row))
  }

  async listUserTickets(userId: string, limit: number): Promise<SupportTicket[]> {
    const rows = await this.query(
      'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    )
    return rows.map((row) => this.toTicket(row))
  }

  async countRecentTickets(userId: string, since: string): Promise<number> {
    const rows = await this.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM support_tickets WHERE user_id = $1 AND created_at >= $2',
      [userId, since],
    )
    return Number(rows[0]?.count ?? 0)
  }

  private toTicket(row: Row): SupportTicket {
    return {
      id: row.id,
      userId: row.user_id,
      subject: row.subject,
      message: row.message,
      status: row.status,
      answer: row.answer,
      createdAt: iso(row.created_at)!,
      updatedAt: iso(row.updated_at)!,
      answeredAt: iso(row.answered_at),
    }
  }
}
