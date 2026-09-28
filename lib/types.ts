import type { PlanId } from './plans'

export interface User {
  id: string
  email: string
  name: string
  passwordHash: string
  role: 'user' | 'admin'
  /**
   * blocked — вход на сайте и в клиенте запрещён; deleted — аккаунт удалён
   * по просьбе владельца: личные данные стёрты, платежи остаются для учёта.
   */
  status: UserStatus
  createdAt: string
}

export type UserStatus = 'active' | 'blocked' | 'deleted'

/** Вход через внешний сервис (VK ID), привязанный к аккаунту. */
export interface OAuthIdentity {
  provider: 'vk'
  /** Идентификатор пользователя у провайдера. */
  subject: string
  userId: string
  /** Имя из профиля провайдера — чтобы показать, какой профиль привязан. */
  name: string
  createdAt: string
}

/**
 * Незавершённый вход через VK ID: от перехода на id.vk.com до возврата.
 * Для входа в клиенте здесь же ждёт результат, который клиент опрашивает.
 */
export interface OAuthState {
  state: string
  action: 'site-login' | 'site-link' | 'client'
  codeVerifier: string
  /** Для привязки — чей аккаунт; для входа — кто вошёл (когда вход завершён). */
  userId: string | null
  /** Устройство клиента, для которого идёт вход. */
  device: { id: string; uuid: string; name: string; os: string; type: string } | null
  /** Куда вернуть после входа на сайте. */
  returnTo: string
  error: string
  createdAt: string
  expiresAt: string
}

/**
 * Команда: сотрудники видят устройства друг друга во вкладке «Доступные
 * устройства» клиента. Один аккаунт — не больше одной команды.
 */
export interface Team {
  id: string
  name: string
  ownerId: string
  createdAt: string
}

export interface TeamMember {
  teamId: string
  userId: string
  /** invited — приглашён, но ещё не принял: устройства друг друга не видны. */
  role: 'owner' | 'member' | 'invited'
  createdAt: string
}

/** Группа устройств команды — так клиент группирует «Доступные устройства». */
export interface DeviceGroup {
  id: string
  teamId: string
  name: string
  createdAt: string
}

/** Тревога клиента: подключение с адреса вне белого списка и т. п. (/api/audit/alarm). */
export interface ClientAlarm {
  id: string
  hostId: string
  /** Тип из клиента RustDesk (AlarmAuditType). */
  type: number
  /** Подробности, как их прислал клиент (JSON-строка). */
  info: string
  ip: string
  createdAt: string
}

/**
 * Ссылка на подключение через веб-клиент для гостя. Пароль устройства
 * хранится зашифрованным и отдаётся только по этой ссылке, пока она жива.
 */
export interface WebShare {
  token: string
  userId: string
  peerId: string
  /** once — одноразовый пароль устройства, fixed — постоянный. */
  passwordType: 'once' | 'fixed'
  passwordSecret: string
  /** null — бессрочно. */
  expiresAt: string | null
  createdAt: string
}

export interface AuthSession {
  tokenHash: string
  userId: string
  createdAt: string
  expiresAt: string
}

/**
 * Одноразовая ссылка для сброса пароля. Храним только хеш токена: сам токен
 * есть лишь в письме, и утечка базы не даёт войти ни в один аккаунт.
 */
export interface PasswordReset {
  tokenHash: string
  userId: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
}

export interface Device {
  id: string
  /** null — устройство видели на сервере, но оно ещё не привязано к аккаунту. */
  userId: string | null
  /** ID устройства в клиенте RemIT (он же RustDesk ID). */
  rustdeskId: string
  uuid: string
  name: string
  os: string
  version: string
  /** Сведения о системе, которые присылает клиент (/api/sysinfo). */
  osUsername: string
  cpu: string
  memory: string
  /** Адрес, с которого устройство последний раз выходило на связь. */
  lastIp: string
  /** Когда клиент последний раз прислал сведения о системе; null — ещё не присылал. */
  sysinfoAt: string | null
  /** Группа устройств команды; null — без группы. */
  groupId: string | null
  lastSeenAt: string
  createdAt: string
}

/**
 * Вход в клиенте RemIT. Сам токен клиенту отдаём один раз, храним только хеш.
 * Отозванные и истёкшие записи остаются — это журнал входов.
 */
export interface ClientToken {
  tokenHash: string
  userId: string
  /** ID устройства в RustDesk, с которого вошли. */
  deviceId: string
  uuid: string
  deviceName: string
  os: string
  ip: string
  createdAt: string
  lastUsedAt: string
  expiresAt: string
  revokedAt: string | null
  /**
   * full — обычный вход; share — гость по ссылке веб-клиента: токен годится
   * только для соединения с одним устройством (peerId) и не открывает API.
   */
  scope: 'full' | 'share'
  peerId: string
  /** Гостевая ссылка, по которой выдан токен (для отзыва вместе с ней). */
  shareToken: string
}

/** Запись адресной книги — поля в том виде, в каком их понимает клиент RustDesk. */
export interface AbPeer {
  id: string
  alias: string
  username: string
  hostname: string
  platform: string
  tags: string[]
  hash: string
  password: string
  forceAlwaysRelay: boolean
  rdpPort: string
  rdpUsername: string
  loginName: string
  note: string
  updatedAt: string
}

/** Метка адресной книги. color — цвет Flutter: 0xAARRGGBB. */
export interface AbTag {
  name: string
  color: number
}

/** 1 — только чтение, 2 — чтение и запись, 3 — полный доступ. */
export type AbRule = 1 | 2 | 3

export interface AbShare {
  userId: string
  rule: AbRule
}

/**
 * Адресная книга. У каждого аккаунта есть личная (personal), можно завести
 * общие и дать к ним доступ другим аккаунтам.
 */
export interface AddressBook {
  guid: string
  ownerId: string
  name: string
  personal: boolean
  note: string
  peers: AbPeer[]
  tags: AbTag[]
  shares: AbShare[]
  createdAt: string
  updatedAt: string
}

/** Передача файлов из журнала клиента (/api/audit/file). */
export interface FileAudit {
  id: string
  /** Устройство, на котором работал журнал (управляемое). */
  hostId: string
  controllerId: string
  controllerName: string
  ip: string
  /** 0 — с управляемого устройства, 1 — на него. */
  type: number
  path: string
  isFile: boolean
  /** Сколько файлов в операции. */
  num: number
  /** До десяти самых крупных файлов: [имя, размер]. */
  files: [string, number][]
  createdAt: string
}

export type SubscriptionStatus = 'active' | 'expired' | 'canceled' | 'pending'

export interface Subscription {
  id: string
  userId: string
  plan: PlanId
  status: SubscriptionStatus
  startedAt: string
  expiresAt: string
  autoRenew: boolean
  provider: string
  providerId: string
  /**
   * Персональный лимит одновременных сессий. Нужен корпоративным клиентам:
   * число согласовывается отдельно и не совпадает с тарифной сеткой.
   * null — берём значение из тарифа.
   */
  concurrentSessions: number | null
}

export type PaymentStatus = 'pending' | 'succeeded' | 'canceled'

/**
 * subscription — покупка или продление тарифа на N месяцев;
 * upgrade — доплата за переход на старший тариф до конца текущей подписки.
 */
export type PaymentKind = 'subscription' | 'upgrade'

export interface Payment {
  id: string
  userId: string
  kind: PaymentKind
  /** Тариф, который покупается; для повышения — тот, на который переходят. */
  plan: PlanId
  /** Для повышения — тариф, с которого переходят. */
  fromPlan: PlanId | null
  /** Для повышения — до какой даты действует новый тариф (конец подписки на момент заказа). */
  upgradeUntil: string | null
  /** Для повышения — 0: срок не продлевается. */
  months: number
  amount: number
  status: PaymentStatus
  provider: string
  providerPaymentId: string
  confirmationUrl: string
  createdAt: string
  paidAt: string | null
}

/**
 * Одна сессия удалённого управления. Ключ строится из ID управляемого
 * устройства и conn_id, который присылает клиент в heartbeat и в аудите.
 */
export interface ConnSession {
  key: string
  hostId: string
  connId: number
  /** ID управляющей стороны, приходит из /api/audit/conn. */
  controllerId: string
  /** Кому записывается расход времени: аккаунт или анонимное устройство. */
  subjectKey: string
  userId: string | null
  startedAt: string
  lastTickAt: string
  endedAt: string | null
  seconds: number
  /** Причина закрытия: client | quota | concurrent_limit | stale. */
  closeReason: string | null
  /** Имя управляющей стороны и адрес, с которого подключились (из аудита клиента). */
  controllerName: string
  ip: string
  /** Вид подключения из аудита клиента: 0 — удалённый стол, 1 — файлы, 2 — порты и т. д. */
  connType: number | null
}

/** Суточный расход времени по субъекту тарификации. */
export interface UsageDay {
  subjectKey: string
  day: string
  seconds: number
}

/** Файл сборки клиента для конкретной платформы. */
export interface ReleaseFile {
  /** windows | macos | linux | android | ios */
  os: string
  arch: string
  url: string
  sha256: string
  /** Размер в байтах, 0 — неизвестен. */
  size: number
}

/** Выпуск клиента, который раздаёт наш сервер обновлений. */
export interface Release {
  id: string
  version: string
  channel: 'stable' | 'beta'
  notes: string
  /** Обязательное обновление: клиенту показывается как критическое. */
  mandatory: boolean
  published: boolean
  files: ReleaseFile[]
  createdAt: string
  publishedAt: string | null
}

export type LeadStatus = 'new' | 'in_progress' | 'approved' | 'rejected'

export type TicketStatus = 'new' | 'in_progress' | 'answered' | 'closed'

/**
 * Обращение в поддержку от зарегистрированного пользователя.
 *
 * Почта и имя не дублируются: они берутся из аккаунта, поэтому обращение
 * нельзя отправить от чужого имени.
 */
export interface SupportTicket {
  id: string
  userId: string
  subject: string
  message: string
  status: TicketStatus
  /** Ответ поддержки — его видит пользователь в кабинете. */
  answer: string
  /** Снимки экрана и фотографии, приложенные к обращению. */
  attachments: TicketAttachment[]
  createdAt: string
  updatedAt: string
  answeredAt: string | null
}

/**
 * Приложенная к обращению картинка. Имя присваиваем мы сами по настоящему
 * формату файла, поэтому здесь нет исходного имени из браузера.
 */
export interface TicketAttachment {
  name: string
  url: string
  size: number
  contentType: string
}

/** Заявка с сайта: пробный период для компании или запрос на подключение. */
export interface Lead {
  id: string
  kind: 'trial' | 'contact'
  name: string
  company: string
  email: string
  phone: string
  /** Сколько компьютеров планируют подключить — помогает предложить тариф. */
  devices: string
  comment: string
  status: LeadStatus
  /** Заметка менеджера: что решили по заявке. */
  note: string
  createdAt: string
  handledAt: string | null
}
