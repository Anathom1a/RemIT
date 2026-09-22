import type { PlanId } from './plans'

export interface User {
  id: string
  email: string
  name: string
  passwordHash: string
  role: 'user' | 'admin'
  createdAt: string
}

export interface AuthSession {
  tokenHash: string
  userId: string
  createdAt: string
  expiresAt: string
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
  lastSeenAt: string
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

export interface Payment {
  id: string
  userId: string
  plan: PlanId
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
  /** Причина закрытия: client | quota | stale. */
  closeReason: string | null
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
  createdAt: string
  updatedAt: string
  answeredAt: string | null
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
