import { redirect } from 'next/navigation'
import { config } from './config'
import { getCurrentUser, isServiceRequest } from './auth'
import { getStore } from './store'
import { getPlan } from './plans'
import { billingDay } from './time'
import { closeStaleSessions } from './quota'
import type { User } from './types'

/**
 * Доступ в админку: роль admin в базе или почта из REMIT_ADMIN_EMAILS.
 * Второе нужно, чтобы войти в свежую установку, где роль ещё некому выдать.
 */
export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false
  return user.role === 'admin' || config.admin.emails.includes(user.email)
}

/** Для страниц админки: пускает только администратора. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')
  if (!isAdmin(user)) redirect('/kabinet')
  return user
}

/**
 * Для маршрутов админского API. Кроме администратора принимает сервисный
 * токен — тем же API пользуются скрипты автоматизации.
 */
export async function requireAdminApi(request: Request): Promise<User | null> {
  if (isServiceRequest(request)) return null
  const user = await getCurrentUser()
  if (!isAdmin(user)) throw new AdminForbidden()
  return user
}

export class AdminForbidden extends Error {
  constructor() {
    super('forbidden')
    this.name = 'AdminForbidden'
  }
}

/** Возвращает готовый ответ 403, если запрос пришёл не от администратора. */
export async function denyIfNotAdmin(request: Request): Promise<Response | null> {
  try {
    await requireAdminApi(request)
    return null
  } catch {
    return Response.json({ error: 'Доступ только для администратора' }, { status: 403 })
  }
}

export interface AdminOverview {
  users: number
  activeSubscriptions: number
  /** Ежемесячная выручка активных подписок, копейки. */
  monthlyRevenue: number
  paidLast30Days: number
  activeSessions: number
  devices: number
  usageTodaySeconds: number
  usageTodaySubjects: number
  exhaustedToday: number
  freeSecondsPerDay: number
}

/** Сводка для главной страницы админки. */
export async function getAdminOverview(freeSecondsPerDay: number): Promise<AdminOverview> {
  // Подвисшие сессии не должны раздувать счётчик «сейчас идёт».
  await closeStaleSessions()

  const store = await getStore()
  const day = billingDay()
  const [{ total: users }, subscriptions, payments, sessions, devices, usage] = await Promise.all([
    store.listUsers({ limit: 1, offset: 0 }),
    store.listActiveSubscriptions(),
    store.listRecentPayments(200),
    store.listActiveConnSessions({}),
    store.listDevices(500),
    store.sumUsage(day),
  ])

  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const paidLast30Days = payments
    .filter((payment) => payment.status === 'succeeded' && new Date(payment.paidAt ?? payment.createdAt).getTime() > monthAgo)
    .reduce((total, payment) => total + payment.amount, 0)

  const monthlyRevenue = subscriptions.reduce((total, subscription) => total + getPlan(subscription.plan).priceMonthly, 0)

  return {
    users,
    activeSubscriptions: subscriptions.length,
    monthlyRevenue,
    paidLast30Days,
    activeSessions: sessions.length,
    devices: devices.length,
    usageTodaySeconds: usage.seconds,
    usageTodaySubjects: usage.subjects,
    exhaustedToday: 0,
    freeSecondsPerDay,
  }
}

/**
 * Проверка связи с сервером идентификации (hbbs): открываем TCP-соединение
 * на его порт. Сайт и hbbs в одной сети docker, поэтому адрес внутренний.
 */
export async function checkIdServer(): Promise<{ ok: boolean; address: string; detail: string }> {
  const address = config.rustdesk.hbbsInternal
  const [host, portText] = address.split(':')
  const port = Number(portText) || 21116
  const { Socket } = await import('node:net')
  return new Promise((resolve) => {
    const socket = new Socket()
    const started = Date.now()
    const done = (ok: boolean, detail: string) => {
      socket.destroy()
      resolve({ ok, address, detail })
    }
    socket.setTimeout(3000)
    socket.once('connect', () => done(true, `соединение за ${Date.now() - started} мс`))
    socket.once('timeout', () => done(false, 'нет ответа за 3 с'))
    socket.once('error', (error) => done(false, error.message))
    socket.connect(port, host)
  })
}
