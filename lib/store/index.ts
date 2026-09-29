import type {
  ClientAlarm,
  DeviceGroup,
  OAuthIdentity,
  OAuthState,
  Team,
  TeamMember,
  WebShare,
  AddressBook,
  ClientToken,
  FileAudit,
  AuthSession,
  PasswordReset,
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
  /** Выход на всех устройствах — после смены пароля. */
  deleteUserAuthSessions(userId: string): Promise<void>

  createPasswordReset(reset: PasswordReset): Promise<void>
  /**
   * Погашает ссылку: возвращает запись, только если она ещё не использована
   * и не истекла. Атомарно — двумя вкладками одну ссылку не использовать.
   */
  consumePasswordReset(tokenHash: string, now: string): Promise<PasswordReset | null>
  /** Действующая ссылка (для показа формы) без погашения. */
  findPasswordReset(tokenHash: string, now: string): Promise<PasswordReset | null>
  /** Гасит все неиспользованные ссылки пользователя. */
  invalidatePasswordResets(userId: string, now: string): Promise<void>
  countRecentPasswordResets(userId: string, since: string): Promise<number>

  /** Входы в клиенте RemIT (токены API клиента). */
  createClientToken(token: ClientToken): Promise<void>
  findClientToken(tokenHash: string): Promise<ClientToken | null>
  touchClientToken(tokenHash: string, at: string): Promise<void>
  revokeClientToken(tokenHash: string, at: string): Promise<void>
  /** Выход из клиента на всех устройствах; возвращает, сколько входов закрыто. */
  revokeUserClientTokens(userId: string, at: string): Promise<number>
  /** Отзыв гостевых токенов, выданных по ссылке веб-клиента. */
  revokeShareClientTokens(shareToken: string, at: string): Promise<void>
  /** Новые сверху. Без userId — все (для админки). */
  listClientTokens(filter: { userId?: string; limit: number }): Promise<ClientToken[]>
  /** Последний действующий вход с устройства — чтобы узнать аккаунт веб-клиента. */
  findActiveClientTokenByDevice(deviceId: string, now: string): Promise<ClientToken | null>

  /** Адресные книги клиента. */
  findAddressBook(guid: string): Promise<AddressBook | null>
  findPersonalAddressBook(userId: string): Promise<AddressBook | null>
  listAddressBooksByOwner(userId: string): Promise<AddressBook[]>
  listAddressBooksSharedWith(userId: string): Promise<AddressBook[]>
  listAddressBooks(limit: number): Promise<AddressBook[]>
  /** false — личная книга у владельца уже есть (гонка двух первых запросов). */
  createAddressBook(book: AddressBook): Promise<boolean>
  /**
   * Атомарное изменение книги: mutate получает текущую версию и возвращает
   * новую. Исключение из mutate отменяет изменение. null — книги нет.
   */
  updateAddressBook(guid: string, mutate: (book: AddressBook) => AddressBook): Promise<AddressBook | null>
  deleteAddressBook(guid: string): Promise<void>

  /** Журнал передачи файлов. */
  createFileAudit(audit: FileAudit): Promise<void>
  listFileAudits(filter: { hostIds?: string[]; limit: number }): Promise<FileAudit[]>
  deleteFileAuditsBefore(before: string): Promise<number>

  /** Вход через VK ID. */
  findOAuthIdentity(provider: string, subject: string): Promise<OAuthIdentity | null>
  listOAuthIdentities(userId: string): Promise<OAuthIdentity[]>
  saveOAuthIdentity(identity: OAuthIdentity): Promise<void>
  deleteOAuthIdentity(provider: string, userId: string): Promise<void>
  saveOAuthState(state: OAuthState): Promise<void>
  findOAuthState(state: string): Promise<OAuthState | null>
  deleteOAuthState(state: string): Promise<void>
  deleteExpiredOAuthStates(now: string): Promise<void>

  /** Команды и группы устройств. */
  createTeam(team: Team, owner: TeamMember): Promise<void>
  saveTeam(team: Team): Promise<void>
  findTeam(id: string): Promise<Team | null>
  /** Команда, в которой состоит пользователь, и его роль в ней. */
  findTeamOfUser(userId: string): Promise<{ team: Team; member: TeamMember } | null>
  listTeams(limit: number): Promise<Team[]>
  listTeamMembers(teamId: string): Promise<TeamMember[]>
  /** false — пользователь уже в какой-то команде. */
  addTeamMember(member: TeamMember): Promise<boolean>
  removeTeamMember(teamId: string, userId: string): Promise<void>
  /** Удаляет команду, её группы устройств и снимает группы с устройств. */
  deleteTeam(id: string): Promise<void>
  listDeviceGroups(teamId: string): Promise<DeviceGroup[]>
  findDeviceGroup(id: string): Promise<DeviceGroup | null>
  saveDeviceGroup(group: DeviceGroup): Promise<void>
  deleteDeviceGroup(id: string): Promise<void>
  setDeviceGroup(rustdeskId: string, groupId: string | null): Promise<void>

  /** Тревоги клиента. */
  createAlarm(alarm: ClientAlarm): Promise<void>
  listAlarms(filter: { hostIds?: string[]; limit: number }): Promise<ClientAlarm[]>
  deleteAlarm(id: string): Promise<void>
  deleteAlarmsBefore(before: string): Promise<number>

  /** Ручная чистка журналов из админки. */
  deleteFileAudit(id: string): Promise<void>
  /** Удаляет запись журнала входов; действующие входы не трогает. */
  deleteClientToken(tokenHash: string, now: string): Promise<boolean>
  /** Удаляет завершённые и истёкшие входы старше даты. */
  deleteClientTokensBefore(before: string, now: string): Promise<number>

  /** Ссылки на подключение через веб-клиент. */
  createWebShare(share: WebShare): Promise<void>
  findWebShare(token: string): Promise<WebShare | null>
  listWebSharesByUser(userId: string): Promise<WebShare[]>
  deleteWebShare(token: string): Promise<void>
  deleteWebSharesByUser(userId: string): Promise<void>

  upsertDevice(device: Device): Promise<void>
  findDeviceByRustdeskId(rustdeskId: string): Promise<Device | null>
  listDevicesByUser(userId: string): Promise<Device[]>
  listDevices(limit: number): Promise<Device[]>
  /** Привязка/отвязка устройства к аккаунту. */
  setDeviceOwner(rustdeskId: string, userId: string | null): Promise<void>

  getActiveSubscription(userId: string): Promise<Subscription | null>
  saveSubscription(subscription: Subscription): Promise<void>
  listActiveSubscriptions(): Promise<Subscription[]>
  findSubscriptionById(id: string): Promise<Subscription | null>
  /** Подписки с автопродлением, у которых срок кончается в [from, until]. */
  listRenewalCandidates(from: string, until: string): Promise<Subscription[]>

  createPayment(payment: Payment): Promise<void>
  savePayment(payment: Payment): Promise<void>
  /** Создаёт платёж, если записи с таким id ещё нет; false — уже есть. */
  createPaymentIfAbsent(payment: Payment): Promise<boolean>
  /**
   * Атомарно переводит платёж в «оплачен». true — перевёл этот вызов; false —
   * платёж уже был оплачен (вебхук и досинхронизация пришли одновременно).
   */
  markPaymentSucceeded(id: string, paidAt: string): Promise<boolean>
  /** Оплаченные авансом платежи, чей период кончился, а второго чека ещё нет. */
  listPaymentsDueSettlement(now: string, limit: number): Promise<Payment[]>
  /** Оплаченные с paidAt >= since, по которым чеки ещё не получены. */
  listPaymentsAwaitingReceipt(since: string, limit: number): Promise<Payment[]>
  findPaymentById(id: string): Promise<Payment | null>
  findPaymentByProviderId(providerPaymentId: string): Promise<Payment | null>
  listPaymentsByUser(userId: string, limit: number): Promise<Payment[]>
  listRecentPayments(limit: number): Promise<Payment[]>

  getConnSession(key: string): Promise<ConnSession | null>
  saveConnSession(session: ConnSession): Promise<void>
  listActiveConnSessions(filter: { hostId?: string; subjectKey?: string }): Promise<ConnSession[]>
  listRecentConnSessions(subjectKeys: string[], limit: number): Promise<ConnSession[]>
  /**
   * История подключений аккаунта: сессии, которые записаны на него или его
   * устройства (subjectKeys), и подключения к его устройствам (hostIds).
   */
  listConnSessionsForHistory(
    subjectKeys: string[],
    hostIds: string[],
    since: string,
    limit: number,
  ): Promise<ConnSession[]>
  /** Удаляет журнал старше даты — срок хранения по политике обработки данных. */
  deleteConnSessionsBefore(before: string): Promise<number>
  /** Сколько сессий разорвано из-за лимита одновременных сессий с момента since. */
  countLimitCuts(subjectKey: string, since: string): Promise<{ count: number; lastAt: string | null }>

  addUsage(subjectKey: string, day: string, seconds: number): Promise<UsageDay>
  getUsage(subjectKey: string, day: string): Promise<UsageDay>
  /** Обнуление суточного расхода — админ дарит время или снимает ошибочное списание. */
  resetUsage(subjectKey: string, day: string): Promise<void>
  /** Суммарный расход за сутки: сколько времени и сколько плательщиков. */
  sumUsage(day: string): Promise<{ seconds: number; subjects: number }>

  /** Проверка связи с хранилищем — для мониторинга и /api/health. */
  ping(): Promise<void>
  /** Прибавляет результаты проверок к суточной статистике. */
  addMonitorSamples(samples: { key: string; day: string; ok: boolean }[]): Promise<void>
  /** Прибавляет готовые счётчики (простой сайта, о котором сообщил сторож). */
  addMonitorCounts(key: string, day: string, ok: number, total: number): Promise<void>
  listMonitorDays(sinceDay: string): Promise<MonitorDay[]>
  addMonitorEvent(event: MonitorEvent): Promise<void>
  listMonitorEvents(limit: number): Promise<MonitorEvent[]>
  saveIncident(incident: Incident): Promise<void>
  findIncident(id: string): Promise<Incident | null>
  /** Последние инциденты, новые сверху; открытые — всегда. */
  listIncidents(limit: number): Promise<Incident[]>
  /** Удаляет статистику и события старше указанных. */
  purgeMonitor(beforeDay: string, beforeAt: string): Promise<void>

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

  createTicket(ticket: SupportTicket): Promise<void>
  saveTicket(ticket: SupportTicket): Promise<void>
  findTicket(id: string): Promise<SupportTicket | null>
  listTickets(limit: number): Promise<SupportTicket[]>
  listUserTickets(userId: string, limit: number): Promise<SupportTicket[]>
  countRecentTickets(userId: string, since: string): Promise<number>

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
