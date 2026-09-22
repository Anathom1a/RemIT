import { config } from './config'
import { getPlan, type Plan } from './plans'
import { getStore, type Store } from './store'
import { getRuntimeSettings } from './settings'
import { billingDay, humanDuration, nextResetAt } from './time'
import type { ConnSession, Device } from './types'
import { newId } from './auth'

/**
 * Учёт бесплатных 3 часов в сутки.
 *
 * Время считается по heartbeat-ам, которые управляемый клиент шлёт на
 * /api/heartbeat каждые 15 секунд со списком активных подключений (`conns`).
 * Шлюз (app/api/heartbeat) проксирует их в панель rustdesk-api и попутно
 * начисляет секунды. Когда лимит исчерпан, в ответ клиенту добавляется поле
 * `disconnect` со списком conn_id — клиент сам разрывает эти сессии.
 * Новые подключения дополнительно отклоняет hbbs через /api/v1/quota/check.
 */

export interface QuotaSubject {
  /** user:<id> для аккаунта, device:<rustdesk_id> для непривязанного устройства. */
  key: string
  userId: string | null
  deviceId: string | null
}

export interface QuotaState {
  subjectKey: string
  planId: string
  planName: string
  /** Суточный лимит в секундах, null — без лимита. */
  limitSeconds: number | null
  usedSeconds: number
  /** Остаток до конца суток, null — без лимита. */
  remainingSeconds: number | null
  exhausted: boolean
  concurrentLimit: number
  activeSessions: number
  resetAt: string
  subscriptionExpiresAt: string | null
}

export function userSubject(userId: string): QuotaSubject {
  return { key: `user:${userId}`, userId, deviceId: null }
}

export function deviceSubject(rustdeskId: string): QuotaSubject {
  return { key: `device:${rustdeskId}`, userId: null, deviceId: rustdeskId }
}

/**
 * Кому записывать время. Приоритет — управляющая сторона (оператор платит за
 * свои подключения). Если управляющее устройство неизвестно, берём владельца
 * управляемого устройства, иначе считаем расход анонимному устройству.
 */
export async function resolveSubject(
  store: Store,
  controllerId: string,
  hostId: string,
): Promise<QuotaSubject> {
  if (controllerId) {
    const controller = await store.findDeviceByRustdeskId(controllerId)
    if (controller?.userId) return userSubject(controller.userId)
    return deviceSubject(controllerId)
  }
  const host = await store.findDeviceByRustdeskId(hostId)
  if (host?.userId) return userSubject(host.userId)
  return deviceSubject(hostId)
}

async function planForSubject(
  store: Store,
  subject: QuotaSubject,
): Promise<{ plan: Plan; expiresAt: string | null; concurrentOverride: number | null }> {
  if (!subject.userId) return { plan: getPlan('free'), expiresAt: null, concurrentOverride: null }
  const subscription = await store.getActiveSubscription(subject.userId)
  if (!subscription) return { plan: getPlan('free'), expiresAt: null, concurrentOverride: null }
  return {
    plan: getPlan(subscription.plan),
    expiresAt: subscription.expiresAt,
    // Корпоративным клиентам число сессий согласовывается отдельно.
    concurrentOverride: subscription.concurrentSessions,
  }
}

export async function getQuotaState(subject: QuotaSubject, now = new Date()): Promise<QuotaState> {
  const store = await getStore()
  const { plan, expiresAt, concurrentOverride } = await planForSubject(store, subject)
  const usage = await store.getUsage(subject.key, billingDay(now))
  const active = await store.listActiveConnSessions({ subjectKey: subject.key })
  // Лимит бесплатного тарифа админ меняет из админки, не перезапуская сервис.
  const settings = await getRuntimeSettings()
  const limit = plan.id === 'free' ? settings.freeSecondsPerDay : plan.dailySeconds
  const remaining = limit === null ? null : Math.max(0, limit - usage.seconds)

  return {
    subjectKey: subject.key,
    planId: plan.id,
    planName: plan.name,
    limitSeconds: limit,
    usedSeconds: usage.seconds,
    remainingSeconds: remaining,
    exhausted: remaining !== null && remaining <= 0,
    concurrentLimit: concurrentOverride ?? plan.concurrentSessions,
    activeSessions: active.length,
    resetAt: nextResetAt(now).toISOString(),
    subscriptionExpiresAt: expiresAt,
  }
}

/** Ответ на предварительную проверку от hbbs перед выдачей punch hole. */
export interface QuotaDecision {
  allowed: boolean
  reason: string
  /** Текст, который hbbs покажет в клиенте при отказе. */
  message: string
  state: QuotaState
}

export async function checkQuota(subject: QuotaSubject, now = new Date()): Promise<QuotaDecision> {
  const state = await getQuotaState(subject, now)

  if (state.exhausted) {
    return {
      allowed: false,
      reason: 'daily_limit',
      message:
        `Бесплатный лимит ${humanDuration(state.limitSeconds ?? 0)} в сутки израсходован. ` +
        `Подписка снимает ограничение: ${config.brand.domain}/tarify`,
      state,
    }
  }

  if (state.activeSessions >= state.concurrentLimit) {
    return {
      allowed: false,
      reason: 'concurrent_limit',
      message:
        `Достигнут лимит одновременных сессий (${state.concurrentLimit}). ` +
        `Завершите активное подключение или смените тариф: ${config.brand.domain}/tarify`,
      state,
    }
  }

  return { allowed: true, reason: 'ok', message: '', state }
}

function sessionKey(hostId: string, connId: number): string {
  return `${hostId}:${connId}`
}

/** Регистрирует устройство, которое отчиталось о себе (heartbeat или аудит). */
export async function touchDevice(
  store: Store,
  rustdeskId: string,
  patch: Partial<Pick<Device, 'uuid' | 'name' | 'os' | 'version'>> = {},
  now = new Date(),
): Promise<Device | null> {
  if (!rustdeskId) return null
  const existing = await store.findDeviceByRustdeskId(rustdeskId)
  const device: Device = {
    id: existing?.id ?? newId('dev'),
    userId: existing?.userId ?? null,
    rustdeskId,
    uuid: patch.uuid ?? existing?.uuid ?? '',
    name: patch.name ?? existing?.name ?? '',
    os: patch.os ?? existing?.os ?? '',
    version: patch.version ?? existing?.version ?? '',
    lastSeenAt: now.toISOString(),
    createdAt: existing?.createdAt ?? now.toISOString(),
  }
  await store.upsertDevice(device)
  return device
}

/**
 * Начало сессии из аудита клиента (`action: new`): здесь становится известна
 * управляющая сторона, поэтому расход времени привязывается именно к ней.
 */
export async function openSession(params: {
  hostId: string
  connId: number
  controllerId: string
  now?: Date
}): Promise<ConnSession> {
  const store = await getStore()
  const now = params.now ?? new Date()
  const key = sessionKey(params.hostId, params.connId)
  const existing = await store.getConnSession(key)
  const subject = await resolveSubject(store, params.controllerId, params.hostId)

  const session: ConnSession = {
    key,
    hostId: params.hostId,
    connId: params.connId,
    controllerId: params.controllerId,
    subjectKey: subject.key,
    userId: subject.userId,
    startedAt: existing && !existing.endedAt ? existing.startedAt : now.toISOString(),
    lastTickAt: now.toISOString(),
    endedAt: null,
    seconds: existing && !existing.endedAt ? existing.seconds : 0,
    closeReason: null,
  }
  await store.saveConnSession(session)
  return session
}

export async function closeSession(hostId: string, connId: number, reason: string, now = new Date()): Promise<void> {
  const store = await getStore()
  const session = await store.getConnSession(sessionKey(hostId, connId))
  if (!session || session.endedAt) return
  await store.saveConnSession({ ...session, endedAt: now.toISOString(), closeReason: reason })
}

export interface HeartbeatResult {
  /** conn_id, которые клиент должен разорвать — лимит исчерпан. */
  disconnect: number[]
  states: QuotaState[]
}

/**
 * Обрабатывает один heartbeat управляемого устройства: начисляет секунды
 * активным сессиям, закрывает исчезнувшие и решает, кого отключить.
 */
export async function processHeartbeat(params: {
  hostId: string
  uuid?: string
  version?: string
  conns: number[]
  now?: Date
}): Promise<HeartbeatResult> {
  const store = await getStore()
  const now = params.now ?? new Date()
  const day = billingDay(now)
  const disconnect: number[] = []
  const states = new Map<string, QuotaState>()

  await touchDevice(store, params.hostId, { uuid: params.uuid, version: params.version }, now)

  const active = await store.listActiveConnSessions({ hostId: params.hostId })
  const alive = new Set(params.conns)

  // Сессии, о которых клиент больше не отчитывается, считаем завершёнными.
  for (const session of active) {
    if (!alive.has(session.connId)) {
      await store.saveConnSession({ ...session, endedAt: now.toISOString(), closeReason: session.closeReason ?? 'client' })
    }
  }

  for (const connId of params.conns) {
    const key = sessionKey(params.hostId, connId)
    let session = await store.getConnSession(key)

    if (!session || session.endedAt) {
      // Аудит подключения мог не дойти — открываем сессию по heartbeat.
      session = await openSession({ hostId: params.hostId, connId, controllerId: session?.controllerId ?? '', now })
    } else {
      const elapsed = Math.floor((now.getTime() - new Date(session.lastTickAt).getTime()) / 1000)
      const delta = Math.max(0, Math.min(elapsed, config.quota.maxTickSeconds))
      if (delta > 0) {
        await store.addUsage(session.subjectKey, day, delta)
        session = { ...session, seconds: session.seconds + delta, lastTickAt: now.toISOString() }
      } else {
        session = { ...session, lastTickAt: now.toISOString() }
      }
      await store.saveConnSession(session)
    }

    let state = states.get(session.subjectKey)
    if (!state) {
      const subject: QuotaSubject = session.userId
        ? userSubject(session.userId)
        : deviceSubject(session.subjectKey.replace(/^device:/, ''))
      state = await getQuotaState(subject, now)
      states.set(session.subjectKey, state)
    }

    if (state.exhausted) {
      disconnect.push(connId)
      await store.saveConnSession({ ...session, endedAt: now.toISOString(), closeReason: 'quota' })
    }
  }

  return { disconnect, states: [...states.values()] }
}

/** Закрывает сессии, по которым давно не было heartbeat (клиент упал или отключился от сети). */
export async function closeStaleSessions(now = new Date()): Promise<number> {
  const store = await getStore()
  const sessions = await store.listActiveConnSessions({})
  const limit = config.quota.staleSessionSeconds * 1000
  let closed = 0
  for (const session of sessions) {
    if (now.getTime() - new Date(session.lastTickAt).getTime() > limit) {
      await store.saveConnSession({ ...session, endedAt: session.lastTickAt, closeReason: 'stale' })
      closed += 1
    }
  }
  return closed
}
