import fs from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import type { Store } from './index'
import type {
  ClientAlarm,
  Company,
  DeviceGroup,
  OAuthIdentity,
  OAuthState,
  Team,
  TeamMember,
  UserStatus,
  WebShare,
  AddressBook,
  ClientToken,
  FileAudit,
  PasswordReset,
  EmailVerification,
  AuthSession,
  ConnSession,
  Device,
  Lead,
  SupportTicket,
  Incident,
  MonitorDay,
  MonitorEvent,
  Payment,
  Release,
  Subscription,
  UsageDay,
  User,
} from '../types'
import type { PlanId } from '../plans'
import type {
  IncidentImpact,
  IncidentStatus,
  IncidentUpdate,
  MonitorStatus,
  PaymentKind,
  PaymentReceipt,
  PaymentRefund,
  PaymentStatus,
  SettlementState,
  SubscriptionStatus,
} from '../types'

type Row = Record<string, any>

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : value

/** Рабочее хранилище на Postgres. Схема лежит в server/sql/001_init.sql. */

const PAYMENT_FIELDS = [
  'id', 'user_id', 'plan', 'months', 'amount', 'status', 'provider', 'provider_payment_id', 'confirmation_url',
  'created_at', 'paid_at', 'kind', 'from_plan', 'upgrade_until', 'recurring', 'save_method', 'subscription_id',
  'idempotence_key', 'failure_reason', 'receipt_email', 'service_ends_at', 'settlement', 'receipts', 'refunds',
  'document_number', 'buyer', 'concurrent_sessions',
]
const PAYMENT_COLUMNS = PAYMENT_FIELDS.join(', ')
const PAYMENT_VALUES = PAYMENT_FIELDS.map((_, index) => `$${index + 1}`).join(', ')

function paymentParams(payment: Payment): unknown[] {
  return [
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
    payment.kind,
    payment.fromPlan,
    payment.upgradeUntil,
    payment.recurring,
    payment.saveMethod,
    payment.subscriptionId,
    payment.idempotenceKey,
    payment.failureReason,
    payment.receiptEmail,
    payment.serviceEndsAt,
    payment.settlement,
    JSON.stringify(payment.receipts ?? []),
    JSON.stringify(payment.refunds ?? []),
    payment.documentNumber ?? '',
    payment.buyer ? JSON.stringify(payment.buyer) : null,
    payment.concurrentSessions ?? null,
  ]
}

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
      status: (row.status ?? 'active') as UserStatus,
      createdAt: iso(row.created_at)!,
      emailVerifiedAt: iso(row.email_verified_at ?? null),
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
      osUsername: row.os_username ?? '',
      cpu: row.cpu ?? '',
      memory: row.memory ?? '',
      lastIp: row.last_ip ?? '',
      sysinfoAt: iso(row.sysinfo_at ?? null),
      groupId: row.group_id ?? null,
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
      paymentMethodId: row.payment_method_id ?? '',
      paymentMethodTitle: row.payment_method_title ?? '',
      renewMonths: row.renew_months ?? 1,
      renewAttempts: row.renew_attempts ?? 0,
      renewNextAt: iso(row.renew_next_at ?? null),
      renewNoticeFor: iso(row.renew_notice_for ?? null),
      renewError: row.renew_error ?? '',
    }
  }

  private toPayment(row: Row): Payment {
    return {
      id: row.id,
      userId: row.user_id,
      kind: (row.kind ?? 'subscription') as PaymentKind,
      plan: row.plan as PlanId,
      fromPlan: (row.from_plan ?? null) as PlanId | null,
      upgradeUntil: iso(row.upgrade_until ?? null),
      months: row.months,
      amount: Number(row.amount),
      status: row.status as PaymentStatus,
      provider: row.provider,
      providerPaymentId: row.provider_payment_id,
      confirmationUrl: row.confirmation_url,
      createdAt: iso(row.created_at)!,
      paidAt: iso(row.paid_at),
      recurring: Boolean(row.recurring),
      saveMethod: Boolean(row.save_method),
      subscriptionId: row.subscription_id ?? null,
      idempotenceKey: row.idempotence_key ?? '',
      failureReason: row.failure_reason ?? '',
      receiptEmail: row.receipt_email ?? '',
      serviceEndsAt: iso(row.service_ends_at ?? null),
      settlement: (row.settlement ?? '') as SettlementState,
      receipts: (row.receipts ?? []) as PaymentReceipt[],
      refunds: (row.refunds ?? []) as PaymentRefund[],
      documentNumber: row.document_number ?? '',
      buyer: (row.buyer ?? null) as Company | null,
      concurrentSessions: row.concurrent_sessions ?? null,
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
      controllerName: row.controller_name ?? '',
      ip: row.ip ?? '',
      connType: row.conn_type ?? null,
    }
  }

  async createUser(user: User): Promise<void> {
    await this.query(
      `INSERT INTO users (id, email, name, password_hash, role, status, created_at, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user.id, user.email, user.name, user.passwordHash, user.role, user.status, user.createdAt, user.emailVerifiedAt],
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
      'UPDATE users SET email = $2, name = $3, password_hash = $4, role = $5, status = $6, email_verified_at = $7 WHERE id = $1',
      [user.id, user.email, user.name, user.passwordHash, user.role, user.status, user.emailVerifiedAt],
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

  async deleteUserAuthSessions(userId: string): Promise<void> {
    await this.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId])
  }

  async createEmailVerification(verification: EmailVerification): Promise<void> {
    await this.query(
      `INSERT INTO email_verifications (token_hash, user_id, email, created_at, expires_at, used_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [verification.tokenHash, verification.userId, verification.email, verification.createdAt, verification.expiresAt, verification.usedAt],
    )
  }

  async consumeEmailVerification(tokenHash: string, now: string): Promise<EmailVerification | null> {
    const rows = await this.query(
      `UPDATE email_verifications SET used_at = $2
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING *`,
      [tokenHash, now],
    )
    const row = rows[0]
    return row
      ? {
          tokenHash: row.token_hash,
          userId: row.user_id,
          email: row.email,
          createdAt: iso(row.created_at)!,
          expiresAt: iso(row.expires_at)!,
          usedAt: iso(row.used_at),
        }
      : null
  }

  async countRecentEmailVerifications(userId: string, since: string): Promise<number> {
    const rows = await this.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM email_verifications WHERE user_id = $1 AND created_at >= $2',
      [userId, since],
    )
    return Number(rows[0]?.count ?? 0)
  }

  async createPasswordReset(reset: PasswordReset): Promise<void> {
    await this.query(
      `INSERT INTO password_resets (token_hash, user_id, created_at, expires_at, used_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [reset.tokenHash, reset.userId, reset.createdAt, reset.expiresAt, reset.usedAt],
    )
  }

  async findPasswordReset(tokenHash: string, now: string): Promise<PasswordReset | null> {
    const rows = await this.query(
      'SELECT * FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2',
      [tokenHash, now],
    )
    return rows[0] ? this.toPasswordReset(rows[0]) : null
  }

  async consumePasswordReset(tokenHash: string, now: string): Promise<PasswordReset | null> {
    // Одним запросом: проверка и погашение не разрываются, и две одновременные
    // отправки формы не сменят пароль дважды.
    const rows = await this.query(
      `UPDATE password_resets SET used_at = $2
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
       RETURNING *`,
      [tokenHash, now],
    )
    return rows[0] ? this.toPasswordReset(rows[0]) : null
  }

  async invalidatePasswordResets(userId: string, now: string): Promise<void> {
    await this.query('UPDATE password_resets SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL', [
      userId,
      now,
    ])
  }

  async countRecentPasswordResets(userId: string, since: string): Promise<number> {
    const rows = await this.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM password_resets WHERE user_id = $1 AND created_at >= $2',
      [userId, since],
    )
    return Number(rows[0]?.count ?? 0)
  }

  private toPasswordReset(row: Row): PasswordReset {
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      createdAt: iso(row.created_at)!,
      expiresAt: iso(row.expires_at)!,
      usedAt: iso(row.used_at),
    }
  }

  private toClientToken(row: Row): ClientToken {
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      deviceId: row.device_id,
      uuid: row.uuid,
      deviceName: row.device_name,
      os: row.os,
      ip: row.ip,
      createdAt: iso(row.created_at)!,
      lastUsedAt: iso(row.last_used_at)!,
      expiresAt: iso(row.expires_at)!,
      revokedAt: iso(row.revoked_at),
      scope: row.scope === 'share' ? 'share' : 'full',
      peerId: row.peer_id ?? '',
      shareToken: row.share_token ?? '',
    }
  }

  async createClientToken(token: ClientToken): Promise<void> {
    await this.query(
      `INSERT INTO client_tokens (token_hash, user_id, device_id, uuid, device_name, os, ip, created_at, last_used_at,
                                  expires_at, revoked_at, scope, peer_id, share_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        token.tokenHash,
        token.userId,
        token.deviceId,
        token.uuid,
        token.deviceName,
        token.os,
        token.ip,
        token.createdAt,
        token.lastUsedAt,
        token.expiresAt,
        token.revokedAt,
        token.scope,
        token.peerId,
        token.shareToken,
      ],
    )
  }

  async findClientToken(tokenHash: string): Promise<ClientToken | null> {
    const rows = await this.query('SELECT * FROM client_tokens WHERE token_hash = $1', [tokenHash])
    return rows[0] ? this.toClientToken(rows[0]) : null
  }

  async touchClientToken(tokenHash: string, at: string): Promise<void> {
    await this.query('UPDATE client_tokens SET last_used_at = $2 WHERE token_hash = $1', [tokenHash, at])
  }

  async revokeClientToken(tokenHash: string, at: string): Promise<void> {
    await this.query('UPDATE client_tokens SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL', [
      tokenHash,
      at,
    ])
  }

  async revokeUserClientTokens(userId: string, at: string): Promise<number> {
    const rows = await this.query(
      `UPDATE client_tokens SET revoked_at = $2
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
       RETURNING token_hash`,
      [userId, at],
    )
    return rows.length
  }

  async revokeShareClientTokens(shareToken: string, at: string): Promise<void> {
    await this.query('UPDATE client_tokens SET revoked_at = $2 WHERE share_token = $1 AND revoked_at IS NULL', [
      shareToken,
      at,
    ])
  }

  async listClientTokens(filter: { userId?: string; limit: number }): Promise<ClientToken[]> {
    const rows = filter.userId
      ? await this.query('SELECT * FROM client_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [
          filter.userId,
          filter.limit,
        ])
      : await this.query('SELECT * FROM client_tokens ORDER BY created_at DESC LIMIT $1', [filter.limit])
    return rows.map((row) => this.toClientToken(row))
  }

  async findActiveClientTokenByDevice(deviceId: string, now: string): Promise<ClientToken | null> {
    const rows = await this.query(
      `SELECT * FROM client_tokens WHERE device_id = $1 AND revoked_at IS NULL AND expires_at > $2
       ORDER BY created_at DESC LIMIT 1`,
      [deviceId, now],
    )
    return rows[0] ? this.toClientToken(rows[0]) : null
  }

  private toAddressBook(row: Row): AddressBook {
    return {
      guid: row.guid,
      ownerId: row.owner_id,
      name: row.name,
      personal: row.personal,
      note: row.note,
      peers: row.peers ?? [],
      tags: row.tags ?? [],
      shares: row.shares ?? [],
      createdAt: iso(row.created_at)!,
      updatedAt: iso(row.updated_at)!,
    }
  }

  async findAddressBook(guid: string): Promise<AddressBook | null> {
    const rows = await this.query('SELECT * FROM address_books WHERE guid = $1', [guid])
    return rows[0] ? this.toAddressBook(rows[0]) : null
  }

  async findPersonalAddressBook(userId: string): Promise<AddressBook | null> {
    const rows = await this.query('SELECT * FROM address_books WHERE owner_id = $1 AND personal', [userId])
    return rows[0] ? this.toAddressBook(rows[0]) : null
  }

  async listAddressBooksByOwner(userId: string): Promise<AddressBook[]> {
    const rows = await this.query(
      'SELECT * FROM address_books WHERE owner_id = $1 ORDER BY personal DESC, created_at',
      [userId],
    )
    return rows.map((row) => this.toAddressBook(row))
  }

  async listAddressBooksSharedWith(userId: string): Promise<AddressBook[]> {
    const rows = await this.query('SELECT * FROM address_books WHERE shares @> $1::jsonb ORDER BY created_at', [
      JSON.stringify([{ userId }]),
    ])
    return rows.map((row) => this.toAddressBook(row))
  }

  async listAddressBooks(limit: number): Promise<AddressBook[]> {
    const rows = await this.query('SELECT * FROM address_books ORDER BY updated_at DESC LIMIT $1', [limit])
    return rows.map((row) => this.toAddressBook(row))
  }

  async createAddressBook(book: AddressBook): Promise<boolean> {
    const rows = await this.query(
      `INSERT INTO address_books (guid, owner_id, name, personal, note, peers, tags, shares, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING
       RETURNING guid`,
      [
        book.guid,
        book.ownerId,
        book.name,
        book.personal,
        book.note,
        JSON.stringify(book.peers),
        JSON.stringify(book.tags),
        JSON.stringify(book.shares),
        book.createdAt,
        book.updatedAt,
      ],
    )
    return rows.length > 0
  }

  async updateAddressBook(guid: string, mutate: (book: AddressBook) => AddressBook): Promise<AddressBook | null> {
    // Книга меняется целиком: блокируем строку, чтобы клиент и кабинет,
    // меняющие её одновременно, не затёрли правки друг друга.
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query('SELECT * FROM address_books WHERE guid = $1 FOR UPDATE', [guid])
      if (!result.rows[0]) {
        await client.query('ROLLBACK')
        return null
      }
      const next = mutate(this.toAddressBook(result.rows[0]))
      await client.query(
        `UPDATE address_books SET name = $2, note = $3, peers = $4, tags = $5, shares = $6, updated_at = $7
         WHERE guid = $1`,
        [
          guid,
          next.name,
          next.note,
          JSON.stringify(next.peers),
          JSON.stringify(next.tags),
          JSON.stringify(next.shares),
          next.updatedAt,
        ],
      )
      await client.query('COMMIT')
      return next
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async deleteAddressBook(guid: string): Promise<void> {
    await this.query('DELETE FROM address_books WHERE guid = $1', [guid])
  }

  private toFileAudit(row: Row): FileAudit {
    return {
      id: row.id,
      hostId: row.host_id,
      controllerId: row.controller_id,
      controllerName: row.controller_name,
      ip: row.ip,
      type: row.type,
      path: row.path,
      isFile: row.is_file,
      num: row.num,
      files: row.files ?? [],
      createdAt: iso(row.created_at)!,
    }
  }

  async createFileAudit(audit: FileAudit): Promise<void> {
    await this.query(
      `INSERT INTO file_audits (id, host_id, controller_id, controller_name, ip, type, path, is_file, num, files, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        audit.id,
        audit.hostId,
        audit.controllerId,
        audit.controllerName,
        audit.ip,
        audit.type,
        audit.path,
        audit.isFile,
        audit.num,
        JSON.stringify(audit.files),
        audit.createdAt,
      ],
    )
  }

  async listFileAudits(filter: { hostIds?: string[]; limit: number }): Promise<FileAudit[]> {
    const rows = filter.hostIds
      ? await this.query(
          'SELECT * FROM file_audits WHERE host_id = ANY($1) ORDER BY created_at DESC LIMIT $2',
          [filter.hostIds, filter.limit],
        )
      : await this.query('SELECT * FROM file_audits ORDER BY created_at DESC LIMIT $1', [filter.limit])
    return rows.map((row) => this.toFileAudit(row))
  }

  async deleteFileAuditsBefore(before: string): Promise<number> {
    const rows = await this.query('DELETE FROM file_audits WHERE created_at < $1 RETURNING id', [before])
    return rows.length
  }

  private toOAuthIdentity(row: Row): OAuthIdentity {
    return {
      provider: row.provider,
      subject: row.subject,
      userId: row.user_id,
      name: row.name,
      createdAt: iso(row.created_at)!,
    }
  }

  async findOAuthIdentity(provider: string, subject: string): Promise<OAuthIdentity | null> {
    const rows = await this.query('SELECT * FROM oauth_identities WHERE provider = $1 AND subject = $2', [
      provider,
      subject,
    ])
    return rows[0] ? this.toOAuthIdentity(rows[0]) : null
  }

  async listOAuthIdentities(userId: string): Promise<OAuthIdentity[]> {
    const rows = await this.query('SELECT * FROM oauth_identities WHERE user_id = $1', [userId])
    return rows.map((row) => this.toOAuthIdentity(row))
  }

  async saveOAuthIdentity(identity: OAuthIdentity): Promise<void> {
    await this.query('DELETE FROM oauth_identities WHERE provider = $1 AND (subject = $2 OR user_id = $3)', [
      identity.provider,
      identity.subject,
      identity.userId,
    ])
    await this.query(
      `INSERT INTO oauth_identities (provider, subject, user_id, name, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [identity.provider, identity.subject, identity.userId, identity.name, identity.createdAt],
    )
  }

  async deleteOAuthIdentity(provider: string, userId: string): Promise<void> {
    await this.query('DELETE FROM oauth_identities WHERE provider = $1 AND user_id = $2', [provider, userId])
  }

  async saveOAuthState(state: OAuthState): Promise<void> {
    await this.query(
      `INSERT INTO oauth_states (state, data, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (state) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
      [state.state, JSON.stringify(state), state.expiresAt],
    )
  }

  async findOAuthState(state: string): Promise<OAuthState | null> {
    const rows = await this.query('SELECT data FROM oauth_states WHERE state = $1', [state])
    return rows[0] ? (rows[0].data as OAuthState) : null
  }

  async deleteOAuthState(state: string): Promise<void> {
    await this.query('DELETE FROM oauth_states WHERE state = $1', [state])
  }

  async deleteExpiredOAuthStates(now: string): Promise<void> {
    await this.query('DELETE FROM oauth_states WHERE expires_at <= $1', [now])
  }

  private toTeam(row: Row): Team {
    return { id: row.id, name: row.name, ownerId: row.owner_id, createdAt: iso(row.created_at)! }
  }

  private toTeamMember(row: Row): TeamMember {
    return { teamId: row.team_id, userId: row.user_id, role: row.role, createdAt: iso(row.created_at)! }
  }

  async createTeam(team: Team, owner: TeamMember): Promise<void> {
    await this.query('INSERT INTO teams (id, name, owner_id, created_at) VALUES ($1, $2, $3, $4)', [
      team.id,
      team.name,
      team.ownerId,
      team.createdAt,
    ])
    await this.query('INSERT INTO team_members (team_id, user_id, role, created_at) VALUES ($1, $2, $3, $4)', [
      owner.teamId,
      owner.userId,
      owner.role,
      owner.createdAt,
    ])
  }

  async saveTeam(team: Team): Promise<void> {
    await this.query('UPDATE teams SET name = $2, owner_id = $3 WHERE id = $1', [team.id, team.name, team.ownerId])
  }

  async findTeam(id: string): Promise<Team | null> {
    const rows = await this.query('SELECT * FROM teams WHERE id = $1', [id])
    return rows[0] ? this.toTeam(rows[0]) : null
  }

  async findTeamOfUser(userId: string): Promise<{ team: Team; member: TeamMember } | null> {
    const rows = await this.query(
      `SELECT t.*, m.role AS member_role, m.created_at AS member_created_at
       FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = $1`,
      [userId],
    )
    if (!rows[0]) return null
    return {
      team: this.toTeam(rows[0]),
      member: { teamId: rows[0].id, userId, role: rows[0].member_role, createdAt: iso(rows[0].member_created_at)! },
    }
  }

  async listTeams(limit: number): Promise<Team[]> {
    const rows = await this.query('SELECT * FROM teams ORDER BY created_at DESC LIMIT $1', [limit])
    return rows.map((row) => this.toTeam(row))
  }

  async listTeamMembers(teamId: string): Promise<TeamMember[]> {
    const rows = await this.query(
      `SELECT * FROM team_members WHERE team_id = $1 ORDER BY (role = 'owner') DESC, created_at`,
      [teamId],
    )
    return rows.map((row) => this.toTeamMember(row))
  }

  async addTeamMember(member: TeamMember): Promise<boolean> {
    const rows = await this.query(
      `INSERT INTO team_members (team_id, user_id, role, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [member.teamId, member.userId, member.role, member.createdAt],
    )
    return rows.length > 0
  }

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await this.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId])
  }

  async deleteTeam(id: string): Promise<void> {
    await this.query('UPDATE devices SET group_id = NULL WHERE group_id IN (SELECT id FROM device_groups WHERE team_id = $1)', [id])
    await this.query('DELETE FROM teams WHERE id = $1', [id])
  }

  private toDeviceGroup(row: Row): DeviceGroup {
    return { id: row.id, teamId: row.team_id, name: row.name, createdAt: iso(row.created_at)! }
  }

  async listDeviceGroups(teamId: string): Promise<DeviceGroup[]> {
    const rows = await this.query('SELECT * FROM device_groups WHERE team_id = $1 ORDER BY name', [teamId])
    return rows.map((row) => this.toDeviceGroup(row))
  }

  async findDeviceGroup(id: string): Promise<DeviceGroup | null> {
    const rows = await this.query('SELECT * FROM device_groups WHERE id = $1', [id])
    return rows[0] ? this.toDeviceGroup(rows[0]) : null
  }

  async saveDeviceGroup(group: DeviceGroup): Promise<void> {
    await this.query(
      `INSERT INTO device_groups (id, team_id, name, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [group.id, group.teamId, group.name, group.createdAt],
    )
  }

  async deleteDeviceGroup(id: string): Promise<void> {
    await this.query('UPDATE devices SET group_id = NULL WHERE group_id = $1', [id])
    await this.query('DELETE FROM device_groups WHERE id = $1', [id])
  }

  async setDeviceGroup(rustdeskId: string, groupId: string | null): Promise<void> {
    await this.query('UPDATE devices SET group_id = $2 WHERE rustdesk_id = $1', [rustdeskId, groupId])
  }

  private toAlarm(row: Row): ClientAlarm {
    return { id: row.id, hostId: row.host_id, type: row.type, info: row.info, ip: row.ip, createdAt: iso(row.created_at)! }
  }

  async createAlarm(alarm: ClientAlarm): Promise<void> {
    await this.query('INSERT INTO client_alarms (id, host_id, type, info, ip, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [
      alarm.id,
      alarm.hostId,
      alarm.type,
      alarm.info,
      alarm.ip,
      alarm.createdAt,
    ])
  }

  async listAlarms(filter: { hostIds?: string[]; limit: number }): Promise<ClientAlarm[]> {
    const rows = filter.hostIds
      ? await this.query('SELECT * FROM client_alarms WHERE host_id = ANY($1) ORDER BY created_at DESC LIMIT $2', [
          filter.hostIds,
          filter.limit,
        ])
      : await this.query('SELECT * FROM client_alarms ORDER BY created_at DESC LIMIT $1', [filter.limit])
    return rows.map((row) => this.toAlarm(row))
  }

  async deleteAlarm(id: string): Promise<void> {
    await this.query('DELETE FROM client_alarms WHERE id = $1', [id])
  }

  async deleteAlarmsBefore(before: string): Promise<number> {
    const rows = await this.query('DELETE FROM client_alarms WHERE created_at < $1 RETURNING id', [before])
    return rows.length
  }

  async deleteFileAudit(id: string): Promise<void> {
    await this.query('DELETE FROM file_audits WHERE id = $1', [id])
  }

  async deleteClientToken(tokenHash: string, now: string): Promise<boolean> {
    const rows = await this.query(
      `DELETE FROM client_tokens WHERE token_hash = $1 AND (revoked_at IS NOT NULL OR expires_at <= $2)
       RETURNING token_hash`,
      [tokenHash, now],
    )
    return rows.length > 0
  }

  async deleteClientTokensBefore(before: string, now: string): Promise<number> {
    const rows = await this.query(
      `DELETE FROM client_tokens WHERE created_at < $1 AND (revoked_at IS NOT NULL OR expires_at <= $2)
       RETURNING token_hash`,
      [before, now],
    )
    return rows.length
  }

  private toWebShare(row: Row): WebShare {
    return {
      token: row.token,
      userId: row.user_id,
      peerId: row.peer_id,
      passwordType: row.password_type === 'fixed' ? 'fixed' : 'once',
      passwordSecret: row.password_secret,
      expiresAt: iso(row.expires_at ?? null),
      createdAt: iso(row.created_at)!,
    }
  }

  async createWebShare(share: WebShare): Promise<void> {
    await this.query(
      `INSERT INTO web_shares (token, user_id, peer_id, password_type, password_secret, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [share.token, share.userId, share.peerId, share.passwordType, share.passwordSecret, share.expiresAt, share.createdAt],
    )
  }

  async findWebShare(token: string): Promise<WebShare | null> {
    const rows = await this.query('SELECT * FROM web_shares WHERE token = $1', [token])
    return rows[0] ? this.toWebShare(rows[0]) : null
  }

  async listWebSharesByUser(userId: string): Promise<WebShare[]> {
    const rows = await this.query('SELECT * FROM web_shares WHERE user_id = $1 ORDER BY created_at DESC', [userId])
    return rows.map((row) => this.toWebShare(row))
  }

  async deleteWebShare(token: string): Promise<void> {
    await this.query('DELETE FROM web_shares WHERE token = $1', [token])
  }

  async deleteWebSharesByUser(userId: string): Promise<void> {
    await this.query('DELETE FROM web_shares WHERE user_id = $1', [userId])
  }

  async upsertDevice(device: Device): Promise<void> {
    await this.query(
      `INSERT INTO devices (id, user_id, rustdesk_id, uuid, name, os, version, os_username, cpu, memory, last_ip,
                            sysinfo_at, last_seen_at, created_at, group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (rustdesk_id) DO UPDATE SET
         uuid = COALESCE(NULLIF(EXCLUDED.uuid, ''), devices.uuid),
         name = COALESCE(NULLIF(EXCLUDED.name, ''), devices.name),
         os = COALESCE(NULLIF(EXCLUDED.os, ''), devices.os),
         version = COALESCE(NULLIF(EXCLUDED.version, ''), devices.version),
         os_username = COALESCE(NULLIF(EXCLUDED.os_username, ''), devices.os_username),
         cpu = COALESCE(NULLIF(EXCLUDED.cpu, ''), devices.cpu),
         memory = COALESCE(NULLIF(EXCLUDED.memory, ''), devices.memory),
         last_ip = COALESCE(NULLIF(EXCLUDED.last_ip, ''), devices.last_ip),
         sysinfo_at = COALESCE(EXCLUDED.sysinfo_at, devices.sysinfo_at),
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
        device.osUsername,
        device.cpu,
        device.memory,
        device.lastIp,
        device.sysinfoAt,
        device.lastSeenAt,
        device.createdAt,
        device.groupId,
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
      `INSERT INTO subscriptions (id, user_id, plan, status, started_at, expires_at, auto_renew, provider, provider_id,
         concurrent_sessions, payment_method_id, payment_method_title, renew_months, renew_attempts, renew_next_at,
         renew_notice_for, renew_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         plan = EXCLUDED.plan,
         status = EXCLUDED.status,
         started_at = EXCLUDED.started_at,
         expires_at = EXCLUDED.expires_at,
         auto_renew = EXCLUDED.auto_renew,
         provider = EXCLUDED.provider,
         provider_id = EXCLUDED.provider_id,
         concurrent_sessions = EXCLUDED.concurrent_sessions,
         payment_method_id = EXCLUDED.payment_method_id,
         payment_method_title = EXCLUDED.payment_method_title,
         renew_months = EXCLUDED.renew_months,
         renew_attempts = EXCLUDED.renew_attempts,
         renew_next_at = EXCLUDED.renew_next_at,
         renew_notice_for = EXCLUDED.renew_notice_for,
         renew_error = EXCLUDED.renew_error`,
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
        subscription.paymentMethodId,
        subscription.paymentMethodTitle,
        subscription.renewMonths,
        subscription.renewAttempts,
        subscription.renewNextAt,
        subscription.renewNoticeFor,
        subscription.renewError,
      ],
    )
  }

  async findSubscriptionById(id: string): Promise<Subscription | null> {
    const rows = await this.query('SELECT * FROM subscriptions WHERE id = $1', [id])
    return rows[0] ? this.toSubscription(rows[0]) : null
  }

  async listRenewalCandidates(from: string, until: string): Promise<Subscription[]> {
    const rows = await this.query(
      `SELECT * FROM subscriptions
       WHERE auto_renew AND status = 'active' AND expires_at >= $1 AND expires_at <= $2
       ORDER BY expires_at ASC`,
      [from, until],
    )
    return rows.map((row) => this.toSubscription(row))
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
      `INSERT INTO payments (${PAYMENT_COLUMNS})
       VALUES (${PAYMENT_VALUES})
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         provider_payment_id = EXCLUDED.provider_payment_id,
         confirmation_url = EXCLUDED.confirmation_url,
         paid_at = EXCLUDED.paid_at,
         failure_reason = EXCLUDED.failure_reason,
         service_ends_at = EXCLUDED.service_ends_at,
         settlement = EXCLUDED.settlement,
         receipts = EXCLUDED.receipts,
         refunds = EXCLUDED.refunds,
         document_number = EXCLUDED.document_number`,
      paymentParams(payment),
    )
  }

  async createPaymentIfAbsent(payment: Payment): Promise<boolean> {
    const rows = await this.query(
      `INSERT INTO payments (${PAYMENT_COLUMNS}) VALUES (${PAYMENT_VALUES})
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      paymentParams(payment),
    )
    return rows.length > 0
  }

  async markPaymentSucceeded(id: string, paidAt: string): Promise<boolean> {
    const rows = await this.query(
      `UPDATE payments SET status = 'succeeded', paid_at = $2 WHERE id = $1 AND status <> 'succeeded' RETURNING id`,
      [id, paidAt],
    )
    return rows.length > 0
  }

  async listPaymentsDueSettlement(now: string, limit: number): Promise<Payment[]> {
    const rows = await this.query(
      `SELECT * FROM payments
       WHERE settlement = 'due' AND status = 'succeeded' AND service_ends_at <= $1
       ORDER BY service_ends_at ASC LIMIT $2`,
      [now, limit],
    )
    return rows.map((row) => this.toPayment(row))
  }

  async listPaymentsAwaitingReceipt(since: string, limit: number): Promise<Payment[]> {
    const rows = await this.query(
      `SELECT * FROM payments
       WHERE status = 'succeeded' AND provider = 'yookassa' AND paid_at >= $1
         AND (receipts = '[]'::jsonb OR receipts @> '[{"status":"pending"}]'::jsonb)
       ORDER BY paid_at DESC LIMIT $2`,
      [since, limit],
    )
    return rows.map((row) => this.toPayment(row))
  }

  async listStaleInvoices(before: string, limit: number): Promise<Payment[]> {
    const rows = await this.query(
      `SELECT * FROM payments WHERE provider = 'invoice' AND status = 'pending' AND created_at < $1
       ORDER BY created_at LIMIT $2`,
      [before, limit],
    )
    return rows.map((row) => this.toPayment(row))
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
      `INSERT INTO conn_sessions (key, host_id, conn_id, controller_id, subject_key, user_id, started_at, last_tick_at,
                                  ended_at, seconds, close_reason, controller_name, ip, conn_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (key) DO UPDATE SET
         controller_id = EXCLUDED.controller_id,
         subject_key = EXCLUDED.subject_key,
         user_id = EXCLUDED.user_id,
         started_at = EXCLUDED.started_at,
         last_tick_at = EXCLUDED.last_tick_at,
         ended_at = EXCLUDED.ended_at,
         seconds = EXCLUDED.seconds,
         close_reason = EXCLUDED.close_reason,
         controller_name = EXCLUDED.controller_name,
         ip = EXCLUDED.ip,
         conn_type = EXCLUDED.conn_type`,
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
        session.controllerName,
        session.ip,
        session.connType,
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

  async listConnSessionsForHistory(
    subjectKeys: string[],
    hostIds: string[],
    since: string,
    limit: number,
  ): Promise<ConnSession[]> {
    if (subjectKeys.length === 0 && hostIds.length === 0) return []
    const rows = await this.query(
      `SELECT * FROM conn_sessions
       WHERE (subject_key = ANY($1) OR host_id = ANY($2)) AND started_at >= $3
       ORDER BY started_at DESC LIMIT $4`,
      [subjectKeys, hostIds, since, limit],
    )
    return rows.map((row) => this.toConnSession(row))
  }

  async deleteConnSessionsBefore(before: string): Promise<number> {
    // Идущие сессии не трогаем, даже если начались давно.
    const rows = await this.query<{ count: string }>(
      `WITH removed AS (
         DELETE FROM conn_sessions WHERE started_at < $1 AND ended_at IS NOT NULL RETURNING 1
       ) SELECT count(*)::text AS count FROM removed`,
      [before],
    )
    return Number(rows[0]?.count ?? 0)
  }

  async countLimitCuts(subjectKey: string, since: string): Promise<{ count: number; lastAt: string | null }> {
    const rows = await this.query<{ count: string; last_at: Date | null }>(
      `SELECT count(*)::text AS count, max(ended_at) AS last_at FROM conn_sessions
       WHERE subject_key = $1 AND close_reason = 'concurrent_limit' AND ended_at >= $2`,
      [subjectKey, since],
    )
    return { count: Number(rows[0]?.count ?? 0), lastAt: iso(rows[0]?.last_at ?? null) }
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

  async ping(): Promise<void> {
    await this.query('SELECT 1')
  }

  async addMonitorSamples(samples: { key: string; day: string; ok: boolean }[]): Promise<void> {
    if (samples.length === 0) return
    const values: unknown[] = []
    const rows = samples.map((sample, index) => {
      values.push(sample.key, sample.day, sample.ok ? 1 : 0)
      return `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3}, 1)`
    })
    await this.query(
      `INSERT INTO monitor_days (key, day, ok, total) VALUES ${rows.join(', ')}
       ON CONFLICT (key, day) DO UPDATE SET ok = monitor_days.ok + EXCLUDED.ok, total = monitor_days.total + 1`,
      values,
    )
  }

  async addMonitorCounts(key: string, day: string, ok: number, total: number): Promise<void> {
    await this.query(
      `INSERT INTO monitor_days (key, day, ok, total) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key, day) DO UPDATE SET ok = monitor_days.ok + EXCLUDED.ok, total = monitor_days.total + EXCLUDED.total`,
      [key, day, ok, total],
    )
  }

  async listMonitorDays(sinceDay: string): Promise<MonitorDay[]> {
    const rows = await this.query('SELECT * FROM monitor_days WHERE day >= $1 ORDER BY day ASC', [sinceDay])
    return rows.map((row) => ({ key: row.key, day: row.day, ok: row.ok, total: row.total }))
  }

  async addMonitorEvent(event: MonitorEvent): Promise<void> {
    await this.query(
      'INSERT INTO monitor_events (id, check_id, at, status, detail) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [event.id, event.checkId, event.at, event.status, event.detail],
    )
  }

  async listMonitorEvents(limit: number): Promise<MonitorEvent[]> {
    const rows = await this.query('SELECT * FROM monitor_events ORDER BY at DESC LIMIT $1', [limit])
    return rows.map((row) => ({
      id: row.id,
      checkId: row.check_id,
      at: iso(row.at)!,
      status: row.status as MonitorStatus,
      detail: row.detail,
    }))
  }

  async saveIncident(incident: Incident): Promise<void> {
    await this.query(
      `INSERT INTO incidents (id, title, impact, status, components, auto, created_at, resolved_at, starts_at, ends_at, updates)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, impact = EXCLUDED.impact, status = EXCLUDED.status,
         components = EXCLUDED.components, resolved_at = EXCLUDED.resolved_at,
         starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, updates = EXCLUDED.updates`,
      [
        incident.id,
        incident.title,
        incident.impact,
        incident.status,
        JSON.stringify(incident.components),
        incident.auto,
        incident.createdAt,
        incident.resolvedAt,
        incident.startsAt,
        incident.endsAt,
        JSON.stringify(incident.updates),
      ],
    )
  }

  private toIncident(row: Row): Incident {
    return {
      id: row.id,
      title: row.title,
      impact: row.impact as IncidentImpact,
      status: row.status as IncidentStatus,
      components: (row.components ?? []) as string[],
      auto: Boolean(row.auto),
      createdAt: iso(row.created_at)!,
      resolvedAt: iso(row.resolved_at ?? null),
      startsAt: iso(row.starts_at ?? null),
      endsAt: iso(row.ends_at ?? null),
      updates: ((row.updates ?? []) as IncidentUpdate[]).map((update) => ({ ...update })),
    }
  }

  async findIncident(id: string): Promise<Incident | null> {
    const rows = await this.query('SELECT * FROM incidents WHERE id = $1', [id])
    return rows[0] ? this.toIncident(rows[0]) : null
  }

  async listIncidents(limit: number): Promise<Incident[]> {
    const rows = await this.query(
      `(SELECT * FROM incidents WHERE resolved_at IS NULL)
       UNION ALL
       (SELECT * FROM incidents WHERE resolved_at IS NOT NULL ORDER BY created_at DESC LIMIT $1)
       ORDER BY created_at DESC`,
      [limit],
    )
    return rows.map((row) => this.toIncident(row))
  }

  async purgeMonitor(beforeDay: string, beforeAt: string): Promise<void> {
    await this.query('DELETE FROM monitor_days WHERE day < $1', [beforeDay])
    await this.query('DELETE FROM monitor_events WHERE at < $1', [beforeAt])
  }

  async findCompany(userId: string): Promise<Company | null> {
    const [row] = await this.query<{ data: Company }>('SELECT data FROM companies WHERE user_id = $1', [userId])
    return row ? row.data : null
  }

  async saveCompany(company: Company): Promise<void> {
    await this.query(
      `INSERT INTO companies (user_id, data, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [company.userId, JSON.stringify(company), company.updatedAt],
    )
  }

  async deleteCompany(userId: string): Promise<void> {
    await this.query('DELETE FROM companies WHERE user_id = $1', [userId])
  }

  async nextSequence(name: string): Promise<number> {
    // Счётчик живёт в settings: одна строка, атомарный инкремент.
    const [row] = await this.query<{ value: string }>(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, '1', now())
       ON CONFLICT (key) DO UPDATE SET value = ((settings.value)::bigint + 1)::text, updated_at = now()
       RETURNING value`,
      [`sequence:${name}`],
    )
    return Number(row.value)
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
      `INSERT INTO support_tickets
         (id, user_id, subject, message, status, answer, attachments, created_at, updated_at, answered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         answer = EXCLUDED.answer,
         attachments = EXCLUDED.attachments,
         updated_at = EXCLUDED.updated_at,
         answered_at = EXCLUDED.answered_at`,
      [
        ticket.id,
        ticket.userId,
        ticket.subject,
        ticket.message,
        ticket.status,
        ticket.answer,
        JSON.stringify(ticket.attachments ?? []),
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
      attachments: row.attachments ?? [],
      createdAt: iso(row.created_at)!,
      updatedAt: iso(row.updated_at)!,
      answeredAt: iso(row.answered_at),
    }
  }
}
