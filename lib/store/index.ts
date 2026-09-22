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
import { config } from '../config'

/**
 * Хранилище данных сервиса. Реализации: JSON-файл для разработки и Postgres
 * для продакшена. Слой намеренно узкий — только те операции, которые нужны
 * витрине, кабинету и учёту квот.
 */
export interface Store {
  createUser(user: User): Promise<void>
  findUserByEmail(email: string): Promise<User | null>
  findUserById(id: string): Promise<User | null>
  updateUser(user: User): Promise<void>
  /** Список пользователей для админки: поиск по почте и имени, постранично. */
  listUsers(options: { query?: string; limit: number; offset: number }): Promise<{ users: User[]; total: number }>

  createAuthSession(session: AuthSession): Promise<void>
  findAuthSession(tokenHash: string): Promise<AuthSession | null>
  deleteAuthSession(tokenHash: string): Promise<void>

  upsertDevice(device: Device): Promise<void>
  findDeviceByRustdeskId(rustdeskId: string): Promise<Device | null>
  listDevicesByUser(userId: string): Promise<Device[]>
  listDevices(limit: number): Promise<Device[]>
  /** Привязка/отвязка устройства к аккаунту. */
  setDeviceOwner(rustdeskId: string, userId: string | null): Promise<void>

  getActiveSubscription(userId: string): Promise<Subscription | null>
  saveSubscription(subscription: Subscription): Promise<void>
  listActiveSubscriptions(): Promise<Subscription[]>

  createPayment(payment: Payment): Promise<void>
  savePayment(payment: Payment): Promise<void>
  findPaymentById(id: string): Promise<Payment | null>
  findPaymentByProviderId(providerPaymentId: string): Promise<Payment | null>
  listPaymentsByUser(userId: string, limit: number): Promise<Payment[]>
  listRecentPayments(limit: number): Promise<Payment[]>

  getConnSession(key: string): Promise<ConnSession | null>
  saveConnSession(session: ConnSession): Promise<void>
  listActiveConnSessions(filter: { hostId?: string; subjectKey?: string }): Promise<ConnSession[]>
  listRecentConnSessions(subjectKeys: string[], limit: number): Promise<ConnSession[]>

  addUsage(subjectKey: string, day: string, seconds: number): Promise<UsageDay>
  getUsage(subjectKey: string, day: string): Promise<UsageDay>
  /** Обнуление суточного расхода — админ дарит время или снимает ошибочное списание. */
  resetUsage(subjectKey: string, day: string): Promise<void>
  /** Суммарный расход за сутки: сколько времени и сколько плательщиков. */
  sumUsage(day: string): Promise<{ seconds: number; subjects: number }>

  /** Настройки, которые меняются в админке без перезапуска. */
  getSettings(): Promise<Record<string, string>>
  setSetting(key: string, value: string): Promise<void>

  /** Заявки с сайта: пробный период и обращения компаний. */
  createLead(lead: Lead): Promise<void>
  listLeads(limit: number): Promise<Lead[]>
  findLead(id: string): Promise<Lead | null>
  saveLead(lead: Lead): Promise<void>
  /** Сколько заявок пришло с адреса за последние сутки — защита от спама. */
  countRecentLeads(email: string, since: string): Promise<number>

  /** Выпуски клиента для сервера обновлений. */
  listReleases(): Promise<Release[]>
  findRelease(id: string): Promise<Release | null>
  saveRelease(release: Release): Promise<void>
  deleteRelease(id: string): Promise<void>

  init(): Promise<void>
}

let instance: Store | null = null
let initializing: Promise<Store> | null = null

/** Возвращает единственный экземпляр хранилища, создавая его при первом вызове. */
export async function getStore(): Promise<Store> {
  if (instance) return instance
  if (!initializing) {
    initializing = (async () => {
      const store = config.database.url
        ? new (await import('./postgres')).PostgresStore(config.database.url)
        : new (await import('./memory')).MemoryStore(config.database.file)
      await store.init()
      instance = store
      return store
    })()
  }
  return initializing
}
