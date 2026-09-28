import fs from 'node:fs/promises'
import path from 'node:path'
import type { Store } from './index'
import type {
  AddressBook,
  ClientToken,
  FileAudit,
  AuthSession,
  PasswordReset,
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

interface Snapshot {
  users: User[]
  authSessions: AuthSession[]
  passwordResets: PasswordReset[]
  clientTokens: ClientToken[]
  addressBooks: AddressBook[]
  fileAudits: FileAudit[]
  devices: Device[]
  subscriptions: Subscription[]
  payments: Payment[]
  connSessions: ConnSession[]
  usage: UsageDay[]
  settings: Record<string, string>
  releases: Release[]
  leads: Lead[]
  tickets: SupportTicket[]
}

/**
 * Хранилище для разработки: данные держатся в памяти, а источником правды
 * служит JSON-файл. Перечитывание по времени изменения файла обязательно —
 * Next.js собирает маршруты в отдельные бандлы, и синглтон в памяти не общий
 * для страницы и для обработчика API.
 *
 * Годится для `npm run dev` и демонстраций. Для продакшена задайте
 * DATABASE_URL и используйте PostgresStore: там и параллельные записи, и
 * несколько процессов приложения.
 */
export class MemoryStore implements Store {
  private users = new Map<string, User>()
  private authSessions = new Map<string, AuthSession>()
  private passwordResets = new Map<string, PasswordReset>()
  private clientTokens = new Map<string, ClientToken>()
  private addressBooks = new Map<string, AddressBook>()
  private fileAudits: FileAudit[] = []
  private devices = new Map<string, Device>()
  private subscriptions = new Map<string, Subscription>()
  private payments = new Map<string, Payment>()
  private connSessions = new Map<string, ConnSession>()
  private usage = new Map<string, UsageDay>()
  private settings: Record<string, string> = {}
  private releases = new Map<string, Release>()
  private leads = new Map<string, Lead>()
  private tickets = new Map<string, SupportTicket>()
  private loadedMtimeMs = -1

  constructor(private readonly file: string) {}

  async init(): Promise<void> {
    await this.sync()
  }

  /** Перечитывает файл, если его изменил другой бандл или процесс. */
  private async sync(): Promise<void> {
    const target = path.resolve(this.file)
    let mtimeMs: number
    try {
      mtimeMs = (await fs.stat(target)).mtimeMs
    } catch {
      return // Файла ещё нет — работаем с тем, что в памяти.
    }
    if (mtimeMs === this.loadedMtimeMs) return

    try {
      const snapshot = JSON.parse(await fs.readFile(target, 'utf8')) as Partial<Snapshot>
      this.users = new Map(snapshot.users?.map((u) => [u.id, u]))
      this.authSessions = new Map(snapshot.authSessions?.map((s) => [s.tokenHash, s]))
      this.passwordResets = new Map(snapshot.passwordResets?.map((r) => [r.tokenHash, r]))
      this.clientTokens = new Map(snapshot.clientTokens?.map((t) => [t.tokenHash, t]))
      this.addressBooks = new Map(snapshot.addressBooks?.map((b) => [b.guid, b]))
      this.fileAudits = snapshot.fileAudits ?? []
      this.devices = new Map(snapshot.devices?.map((d) => [d.rustdeskId, d]))
      this.subscriptions = new Map(snapshot.subscriptions?.map((s) => [s.id, s]))
      // kind, fromPlan и upgradeUntil появились позже: у старых записей их нет.
      this.payments = new Map(
        snapshot.payments?.map((p) => [
          p.id,
          { ...p, kind: p.kind ?? 'subscription', fromPlan: p.fromPlan ?? null, upgradeUntil: p.upgradeUntil ?? null },
        ]),
      )
      this.connSessions = new Map(snapshot.connSessions?.map((s) => [s.key, s]))
      this.usage = new Map(snapshot.usage?.map((u) => [`${u.subjectKey}|${u.day}`, u]))
      this.settings = snapshot.settings ?? {}
      this.releases = new Map(snapshot.releases?.map((r) => [r.id, r]))
      this.leads = new Map(snapshot.leads?.map((l) => [l.id, l]))
      // attachments появились позже: у старых записей поля нет.
      this.tickets = new Map(
        snapshot.tickets?.map((t) => [t.id, { ...t, attachments: t.attachments ?? [] }]),
      )
      this.loadedMtimeMs = mtimeMs
    } catch {
      // Файл повреждён или пишется прямо сейчас — оставляем текущее состояние.
    }
  }

  private async persist(): Promise<void> {
    const snapshot: Snapshot = {
      users: [...this.users.values()],
      authSessions: [...this.authSessions.values()],
      passwordResets: [...this.passwordResets.values()],
      clientTokens: [...this.clientTokens.values()],
      addressBooks: [...this.addressBooks.values()],
      fileAudits: this.fileAudits,
      devices: [...this.devices.values()],
      subscriptions: [...this.subscriptions.values()],
      payments: [...this.payments.values()],
      connSessions: [...this.connSessions.values()],
      usage: [...this.usage.values()],
      settings: this.settings,
      releases: [...this.releases.values()],
      leads: [...this.leads.values()],
      tickets: [...this.tickets.values()],
    }
    const target = path.resolve(this.file)
    try {
      await fs.mkdir(path.dirname(target), { recursive: true })
      // Запись через временный файл: читатель никогда не увидит половину снимка.
      const temporary = `${target}.${process.pid}.tmp`
      await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8')
      await fs.rename(temporary, target)
      this.loadedMtimeMs = (await fs.stat(target)).mtimeMs
    } catch {
      // Файловая система может быть только для чтения — работаем из памяти.
    }
  }

  async createUser(user: User): Promise<void> {
    await this.sync()
    this.users.set(user.id, user)
    await this.persist()
  }

  async findUserByEmail(email: string): Promise<User | null> {
    await this.sync()
    const normalized = email.trim().toLowerCase()
    return [...this.users.values()].find((u) => u.email === normalized) ?? null
  }

  async findUserById(id: string): Promise<User | null> {
    await this.sync()
    return this.users.get(id) ?? null
  }

  async updateUser(user: User): Promise<void> {
    await this.sync()
    this.users.set(user.id, user)
    await this.persist()
  }

  async listUsers(options: { query?: string; limit: number; offset: number }): Promise<{ users: User[]; total: number }> {
    await this.sync()
    const query = options.query?.trim().toLowerCase() ?? ''
    const matched = [...this.users.values()]
      .filter((u) => !query || u.email.includes(query) || u.name.toLowerCase().includes(query))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { users: matched.slice(options.offset, options.offset + options.limit), total: matched.length }
  }

  async createAuthSession(session: AuthSession): Promise<void> {
    await this.sync()
    this.authSessions.set(session.tokenHash, session)
    await this.persist()
  }

  async findAuthSession(tokenHash: string): Promise<AuthSession | null> {
    await this.sync()
    const session = this.authSessions.get(tokenHash)
    if (!session) return null
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      this.authSessions.delete(tokenHash)
      return null
    }
    return session
  }

  async deleteAuthSession(tokenHash: string): Promise<void> {
    await this.sync()
    this.authSessions.delete(tokenHash)
    await this.persist()
  }

  async deleteUserAuthSessions(userId: string): Promise<void> {
    await this.sync()
    for (const [key, session] of this.authSessions) {
      if (session.userId === userId) this.authSessions.delete(key)
    }
    await this.persist()
  }

  async createPasswordReset(reset: PasswordReset): Promise<void> {
    await this.sync()
    this.passwordResets.set(reset.tokenHash, reset)
    await this.persist()
  }

  async findPasswordReset(tokenHash: string, now: string): Promise<PasswordReset | null> {
    await this.sync()
    const reset = this.passwordResets.get(tokenHash)
    if (!reset || reset.usedAt || reset.expiresAt <= now) return null
    return reset
  }

  async consumePasswordReset(tokenHash: string, now: string): Promise<PasswordReset | null> {
    const reset = await this.findPasswordReset(tokenHash, now)
    if (!reset) return null
    const used = { ...reset, usedAt: now }
    this.passwordResets.set(tokenHash, used)
    await this.persist()
    return used
  }

  async invalidatePasswordResets(userId: string, now: string): Promise<void> {
    await this.sync()
    for (const [key, reset] of this.passwordResets) {
      if (reset.userId === userId && !reset.usedAt) this.passwordResets.set(key, { ...reset, usedAt: now })
    }
    await this.persist()
  }

  async countRecentPasswordResets(userId: string, since: string): Promise<number> {
    await this.sync()
    return [...this.passwordResets.values()].filter((r) => r.userId === userId && r.createdAt >= since).length
  }

  async createClientToken(token: ClientToken): Promise<void> {
    await this.sync()
    this.clientTokens.set(token.tokenHash, token)
    await this.persist()
  }

  async findClientToken(tokenHash: string): Promise<ClientToken | null> {
    await this.sync()
    return this.clientTokens.get(tokenHash) ?? null
  }

  async touchClientToken(tokenHash: string, at: string): Promise<void> {
    await this.sync()
    const token = this.clientTokens.get(tokenHash)
    if (!token) return
    this.clientTokens.set(tokenHash, { ...token, lastUsedAt: at })
    await this.persist()
  }

  async revokeClientToken(tokenHash: string, at: string): Promise<void> {
    await this.sync()
    const token = this.clientTokens.get(tokenHash)
    if (!token || token.revokedAt) return
    this.clientTokens.set(tokenHash, { ...token, revokedAt: at })
    await this.persist()
  }

  async revokeUserClientTokens(userId: string, at: string): Promise<number> {
    await this.sync()
    let count = 0
    for (const [key, token] of this.clientTokens) {
      if (token.userId === userId && !token.revokedAt && token.expiresAt > at) {
        this.clientTokens.set(key, { ...token, revokedAt: at })
        count += 1
      }
    }
    if (count) await this.persist()
    return count
  }

  async listClientTokens(filter: { userId?: string; limit: number }): Promise<ClientToken[]> {
    await this.sync()
    return [...this.clientTokens.values()]
      .filter((t) => !filter.userId || t.userId === filter.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit)
  }

  async findAddressBook(guid: string): Promise<AddressBook | null> {
    await this.sync()
    return this.addressBooks.get(guid) ?? null
  }

  async findPersonalAddressBook(userId: string): Promise<AddressBook | null> {
    await this.sync()
    return [...this.addressBooks.values()].find((b) => b.ownerId === userId && b.personal) ?? null
  }

  async listAddressBooksByOwner(userId: string): Promise<AddressBook[]> {
    await this.sync()
    return [...this.addressBooks.values()]
      .filter((b) => b.ownerId === userId)
      .sort((a, b) => Number(b.personal) - Number(a.personal) || a.createdAt.localeCompare(b.createdAt))
  }

  async listAddressBooksSharedWith(userId: string): Promise<AddressBook[]> {
    await this.sync()
    return [...this.addressBooks.values()]
      .filter((b) => b.shares.some((share) => share.userId === userId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async listAddressBooks(limit: number): Promise<AddressBook[]> {
    await this.sync()
    return [...this.addressBooks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)
  }

  async createAddressBook(book: AddressBook): Promise<boolean> {
    await this.sync()
    if (book.personal && [...this.addressBooks.values()].some((b) => b.ownerId === book.ownerId && b.personal)) {
      return false
    }
    this.addressBooks.set(book.guid, book)
    await this.persist()
    return true
  }

  async updateAddressBook(guid: string, mutate: (book: AddressBook) => AddressBook): Promise<AddressBook | null> {
    await this.sync()
    const book = this.addressBooks.get(guid)
    if (!book) return null
    const next = mutate(structuredClone(book))
    this.addressBooks.set(guid, next)
    await this.persist()
    return next
  }

  async deleteAddressBook(guid: string): Promise<void> {
    await this.sync()
    this.addressBooks.delete(guid)
    await this.persist()
  }

  async createFileAudit(audit: FileAudit): Promise<void> {
    await this.sync()
    this.fileAudits.push(audit)
    await this.persist()
  }

  async listFileAudits(filter: { hostIds?: string[]; limit: number }): Promise<FileAudit[]> {
    await this.sync()
    const hosts = filter.hostIds ? new Set(filter.hostIds) : null
    return this.fileAudits
      .filter((a) => !hosts || hosts.has(a.hostId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit)
  }

  async deleteFileAuditsBefore(before: string): Promise<number> {
    await this.sync()
    const kept = this.fileAudits.filter((a) => a.createdAt >= before)
    const removed = this.fileAudits.length - kept.length
    if (removed) {
      this.fileAudits = kept
      await this.persist()
    }
    return removed
  }

  async upsertDevice(device: Device): Promise<void> {
    await this.sync()
    const existing = this.devices.get(device.rustdeskId)
    this.devices.set(device.rustdeskId, existing ? { ...existing, ...device, userId: device.userId ?? existing.userId } : device)
    await this.persist()
  }

  async findDeviceByRustdeskId(rustdeskId: string): Promise<Device | null> {
    await this.sync()
    return this.devices.get(rustdeskId) ?? null
  }

  async listDevicesByUser(userId: string): Promise<Device[]> {
    await this.sync()
    return [...this.devices.values()]
      .filter((d) => d.userId === userId)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  }

  async setDeviceOwner(rustdeskId: string, userId: string | null): Promise<void> {
    await this.sync()
    const device = this.devices.get(rustdeskId)
    if (!device) return
    this.devices.set(rustdeskId, { ...device, userId })
    await this.persist()
  }

  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    await this.sync()
    const now = Date.now()
    return (
      [...this.subscriptions.values()]
        .filter((s) => s.userId === userId && s.status === 'active' && new Date(s.expiresAt).getTime() > now)
        .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0] ?? null
    )
  }

  async listActiveSubscriptions(): Promise<Subscription[]> {
    await this.sync()
    const now = Date.now()
    return [...this.subscriptions.values()]
      .filter((s) => s.status === 'active' && new Date(s.expiresAt).getTime() > now)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  }

  async saveSubscription(subscription: Subscription): Promise<void> {
    await this.sync()
    this.subscriptions.set(subscription.id, subscription)
    await this.persist()
  }

  async createPayment(payment: Payment): Promise<void> {
    await this.sync()
    this.payments.set(payment.id, payment)
    await this.persist()
  }

  async savePayment(payment: Payment): Promise<void> {
    await this.sync()
    this.payments.set(payment.id, payment)
    await this.persist()
  }

  async findPaymentById(id: string): Promise<Payment | null> {
    await this.sync()
    return this.payments.get(id) ?? null
  }

  async findPaymentByProviderId(providerPaymentId: string): Promise<Payment | null> {
    await this.sync()
    return [...this.payments.values()].find((p) => p.providerPaymentId === providerPaymentId) ?? null
  }

  async listPaymentsByUser(userId: string, limit: number): Promise<Payment[]> {
    await this.sync()
    return [...this.payments.values()]
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  async listRecentPayments(limit: number): Promise<Payment[]> {
    await this.sync()
    return [...this.payments.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  async listDevices(limit: number): Promise<Device[]> {
    await this.sync()
    return [...this.devices.values()]
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, limit)
  }

  async getConnSession(key: string): Promise<ConnSession | null> {
    await this.sync()
    return this.connSessions.get(key) ?? null
  }

  async saveConnSession(session: ConnSession): Promise<void> {
    await this.sync()
    this.connSessions.set(session.key, session)
    await this.persist()
  }

  async listActiveConnSessions(filter: { hostId?: string; subjectKey?: string }): Promise<ConnSession[]> {
    await this.sync()
    return [...this.connSessions.values()].filter((s) => {
      if (s.endedAt) return false
      if (filter.hostId && s.hostId !== filter.hostId) return false
      if (filter.subjectKey && s.subjectKey !== filter.subjectKey) return false
      return true
    })
  }

  async listRecentConnSessions(subjectKeys: string[], limit: number): Promise<ConnSession[]> {
    await this.sync()
    const keys = new Set(subjectKeys)
    return [...this.connSessions.values()]
      .filter((s) => keys.has(s.subjectKey))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
  }

  async listConnSessionsForHistory(
    subjectKeys: string[],
    hostIds: string[],
    since: string,
    limit: number,
  ): Promise<ConnSession[]> {
    await this.sync()
    const keys = new Set(subjectKeys)
    const hosts = new Set(hostIds)
    return [...this.connSessions.values()]
      .filter((s) => (keys.has(s.subjectKey) || hosts.has(s.hostId)) && s.startedAt >= since)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
  }

  async deleteConnSessionsBefore(before: string): Promise<number> {
    await this.sync()
    let removed = 0
    for (const [key, session] of this.connSessions) {
      if (session.startedAt < before && session.endedAt) {
        this.connSessions.delete(key)
        removed += 1
      }
    }
    if (removed > 0) await this.persist()
    return removed
  }

  async countLimitCuts(subjectKey: string, since: string): Promise<{ count: number; lastAt: string | null }> {
    await this.sync()
    const cuts = [...this.connSessions.values()].filter(
      (s) =>
        s.subjectKey === subjectKey &&
        s.closeReason === 'concurrent_limit' &&
        s.endedAt !== null &&
        s.endedAt >= since,
    )
    const lastAt = cuts.reduce<string | null>((max, s) => (!max || s.endedAt! > max ? s.endedAt : max), null)
    return { count: cuts.length, lastAt }
  }

  async addUsage(subjectKey: string, day: string, seconds: number): Promise<UsageDay> {
    await this.sync()
    const key = `${subjectKey}|${day}`
    const current = this.usage.get(key) ?? { subjectKey, day, seconds: 0 }
    const updated: UsageDay = { ...current, seconds: current.seconds + Math.max(0, Math.round(seconds)) }
    this.usage.set(key, updated)
    this.persist()
    return updated
  }

  async getUsage(subjectKey: string, day: string): Promise<UsageDay> {
    await this.sync()
    return this.usage.get(`${subjectKey}|${day}`) ?? { subjectKey, day, seconds: 0 }
  }

  async resetUsage(subjectKey: string, day: string): Promise<void> {
    await this.sync()
    this.usage.delete(`${subjectKey}|${day}`)
    await this.persist()
  }

  async sumUsage(day: string): Promise<{ seconds: number; subjects: number }> {
    await this.sync()
    const rows = [...this.usage.values()].filter((u) => u.day === day)
    return { seconds: rows.reduce((total, row) => total + row.seconds, 0), subjects: rows.length }
  }

  async getSettings(): Promise<Record<string, string>> {
    await this.sync()
    return { ...this.settings }
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.sync()
    this.settings[key] = value
    await this.persist()
  }

  async listReleases(): Promise<Release[]> {
    await this.sync()
    return [...this.releases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async findRelease(id: string): Promise<Release | null> {
    await this.sync()
    return this.releases.get(id) ?? null
  }

  async saveRelease(release: Release): Promise<void> {
    await this.sync()
    this.releases.set(release.id, release)
    await this.persist()
  }

  async deleteRelease(id: string): Promise<void> {
    await this.sync()
    this.releases.delete(id)
    await this.persist()
  }

  async createLead(lead: Lead): Promise<void> {
    await this.sync()
    this.leads.set(lead.id, lead)
    await this.persist()
  }

  async listLeads(limit: number): Promise<Lead[]> {
    await this.sync()
    return [...this.leads.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  async findLead(id: string): Promise<Lead | null> {
    await this.sync()
    return this.leads.get(id) ?? null
  }

  async saveLead(lead: Lead): Promise<void> {
    await this.sync()
    this.leads.set(lead.id, lead)
    await this.persist()
  }

  async countRecentLeads(email: string, since: string): Promise<number> {
    await this.sync()
    const normalized = email.trim().toLowerCase()
    return [...this.leads.values()].filter(
      (lead) => lead.email === normalized && lead.createdAt >= since,
    ).length
  }

  async createTicket(ticket: SupportTicket): Promise<void> {
    await this.saveTicket(ticket)
  }

  async saveTicket(ticket: SupportTicket): Promise<void> {
    await this.sync()
    this.tickets.set(ticket.id, ticket)
    await this.persist()
  }

  async findTicket(id: string): Promise<SupportTicket | null> {
    await this.sync()
    return this.tickets.get(id) ?? null
  }

  async listTickets(limit: number): Promise<SupportTicket[]> {
    await this.sync()
    return [...this.tickets.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  async listUserTickets(userId: string, limit: number): Promise<SupportTicket[]> {
    await this.sync()
    return [...this.tickets.values()]
      .filter((ticket) => ticket.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  async countRecentTickets(userId: string, since: string): Promise<number> {
    await this.sync()
    return [...this.tickets.values()].filter(
      (ticket) => ticket.userId === userId && ticket.createdAt >= since,
    ).length
  }
}
