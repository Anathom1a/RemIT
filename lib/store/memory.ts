import fs from 'node:fs/promises'
import path from 'node:path'
import type { Store } from './index'
import type {
  AuthSession,
  ConnSession,
  Device,
  Lead,
  Payment,
  Release,
  Subscription,
  UsageDay,
  User,
} from '../types'

interface Snapshot {
  users: User[]
  authSessions: AuthSession[]
  devices: Device[]
  subscriptions: Subscription[]
  payments: Payment[]
  connSessions: ConnSession[]
  usage: UsageDay[]
  settings: Record<string, string>
  releases: Release[]
  leads: Lead[]
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
  private devices = new Map<string, Device>()
  private subscriptions = new Map<string, Subscription>()
  private payments = new Map<string, Payment>()
  private connSessions = new Map<string, ConnSession>()
  private usage = new Map<string, UsageDay>()
  private settings: Record<string, string> = {}
  private releases = new Map<string, Release>()
  private leads = new Map<string, Lead>()
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
      this.devices = new Map(snapshot.devices?.map((d) => [d.rustdeskId, d]))
      this.subscriptions = new Map(snapshot.subscriptions?.map((s) => [s.id, s]))
      this.payments = new Map(snapshot.payments?.map((p) => [p.id, p]))
      this.connSessions = new Map(snapshot.connSessions?.map((s) => [s.key, s]))
      this.usage = new Map(snapshot.usage?.map((u) => [`${u.subjectKey}|${u.day}`, u]))
      this.settings = snapshot.settings ?? {}
      this.releases = new Map(snapshot.releases?.map((r) => [r.id, r]))
      this.leads = new Map(snapshot.leads?.map((l) => [l.id, l]))
      this.loadedMtimeMs = mtimeMs
    } catch {
      // Файл повреждён или пишется прямо сейчас — оставляем текущее состояние.
    }
  }

  private async persist(): Promise<void> {
    const snapshot: Snapshot = {
      users: [...this.users.values()],
      authSessions: [...this.authSessions.values()],
      devices: [...this.devices.values()],
      subscriptions: [...this.subscriptions.values()],
      payments: [...this.payments.values()],
      connSessions: [...this.connSessions.values()],
      usage: [...this.usage.values()],
      settings: this.settings,
      releases: [...this.releases.values()],
      leads: [...this.leads.values()],
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
}
