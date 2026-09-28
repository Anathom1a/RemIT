import { connectionsWord, getPlan, type Plan } from './plans'
import { getStore } from './store'
import { formatDateTime } from './time'
import type { ConnSession, User } from './types'

/**
 * История подключений в кабинете и её выгрузка.
 *
 * Глубина истории зависит от тарифа (7–365 дней). Хранится журнал не дольше
 * года — это срок из политики обработки данных; старое удаляет purgeOldHistory.
 */

/** Сколько храним журнал вообще. */
export const HISTORY_RETENTION_DAYS = 365
/** Сколько строк отдаём за раз: страница и выгрузка не должны вешать сервер. */
export const HISTORY_ROW_LIMIT = 5000
const DAY_MS = 24 * 60 * 60 * 1000

export interface HistoryRow {
  key: string
  startedAt: string
  endedAt: string | null
  seconds: number
  hostId: string
  hostName: string
  controllerId: string
  /** outgoing — подключались вы, incoming — подключались к вашему устройству. */
  direction: 'outgoing' | 'incoming'
  status: string
}

export interface History {
  plan: Plan
  days: number
  since: string
  rows: HistoryRow[]
  totalSeconds: number
  /** Строк больше лимита — показаны последние. */
  truncated: boolean
}

const STATUS: Record<string, string> = {
  client: 'завершена',
  quota: 'израсходован дневной лимит',
  concurrent_limit: 'превышен лимит одновременных сессий',
  stale: 'связь потеряна',
}

function statusOf(session: ConnSession): string {
  if (!session.endedAt) return 'идёт сейчас'
  return STATUS[session.closeReason ?? 'client'] ?? 'завершена'
}

export async function getHistory(user: User, now = new Date()): Promise<History> {
  const store = await getStore()
  const [subscription, devices] = await Promise.all([
    store.getActiveSubscription(user.id),
    store.listDevicesByUser(user.id),
  ])
  const plan = getPlan(subscription?.plan ?? 'free')
  const days = Math.min(plan.historyDays, HISTORY_RETENTION_DAYS)
  const since = new Date(now.getTime() - days * DAY_MS).toISOString()

  const names = new Map(devices.map((device) => [device.rustdeskId, device.name]))
  const ownKeys = [`user:${user.id}`, ...devices.map((device) => `device:${device.rustdeskId}`)]
  const own = new Set(ownKeys)

  const sessions = await store.listConnSessionsForHistory(
    ownKeys,
    devices.map((device) => device.rustdeskId),
    since,
    HISTORY_ROW_LIMIT + 1,
  )
  const truncated = sessions.length > HISTORY_ROW_LIMIT

  const rows = sessions.slice(0, HISTORY_ROW_LIMIT).map<HistoryRow>((session) => ({
    key: session.key,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    seconds: session.seconds,
    hostId: session.hostId,
    hostName: names.get(session.hostId) ?? '',
    controllerId: session.controllerId,
    direction: own.has(session.subjectKey) ? 'outgoing' : 'incoming',
    status: statusOf(session),
  }))

  return {
    plan,
    days,
    since,
    rows,
    totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    truncated,
  }
}

/** Минуты с одним знаком после запятой — так Excel в русской локали считает сумму. */
function minutes(seconds: number): string {
  return (Math.round(seconds / 6) / 10).toFixed(1).replace('.', ',')
}

function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * CSV для Excel: разделитель «;» и BOM в начале — иначе русская версия Excel
 * склеит столбцы и покажет кракозябры вместо кириллицы.
 */
export function historyCsv(history: History): string {
  const header = [
    'Начало',
    'Окончание',
    'Длительность, мин',
    'Направление',
    'Устройство (ID)',
    'Имя устройства',
    'Кто подключался (ID)',
    'Как завершилась',
  ]
  const lines = history.rows.map((row) =>
    [
      formatDateTime(row.startedAt),
      row.endedAt ? formatDateTime(row.endedAt) : '',
      minutes(row.seconds),
      row.direction === 'outgoing' ? 'исходящее' : 'входящее',
      row.hostId,
      row.hostName,
      row.controllerId,
      row.status,
    ]
      .map(csvCell)
      .join(';'),
  )
  lines.push(
    ['Итого', '', minutes(history.totalSeconds), '', '', '', '', `${history.rows.length} ${connectionsWord(history.rows.length)}`].join(';'),
  )
  return '﻿' + [header.join(';'), ...lines].join('\r\n') + '\r\n'
}

let lastPurge = 0

/**
 * Удаляет журнал старше срока хранения. Вызывается попутно (из heartbeat),
 * не чаще раза в шесть часов на процесс.
 */
export async function purgeOldHistory(now = new Date()): Promise<number> {
  if (now.getTime() - lastPurge < 6 * 60 * 60 * 1000) return 0
  lastPurge = now.getTime()
  const store = await getStore()
  return store.deleteConnSessionsBefore(new Date(now.getTime() - HISTORY_RETENTION_DAYS * DAY_MS).toISOString())
}
