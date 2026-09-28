import { config } from './config'
import { getPlan, sessionsWord, upgradeTargetForSessions, type Plan } from './plans'
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
 * Когда лимит исчерпан, в ответ клиенту добавляется поле `disconnect` со
 * списком conn_id — клиент сам разрывает эти сессии.
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
    const target = upgradeTargetForSessions(state.concurrentLimit, state.planId)
    return {
      allowed: false,
      reason: 'concurrent_limit',
      message:
        `На тарифе «${state.planName}» одновременно доступно ${state.concurrentLimit} ` +
        `${sessionsWord(state.concurrentLimit)}, и все заняты. Завершите одно из подключений ` +
        (target.negotiable
          ? `или напишите нам — подключим больше сессий: ${config.brand.domain}/kabinet/podpiska`
          : `или перейдите на «${target.name}» (${target.concurrentSessions} ${sessionsWord(target.concurrentSessions)}): ` +
            `${config.brand.domain}/kabinet/podpiska`),
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
  patch: Partial<
    Pick<Device, 'uuid' | 'name' | 'os' | 'version' | 'osUsername' | 'cpu' | 'memory' | 'lastIp' | 'sysinfoAt'>
  > = {},
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
    osUsername: patch.osUsername ?? existing?.osUsername ?? '',
    cpu: patch.cpu ?? existing?.cpu ?? '',
    memory: patch.memory ?? existing?.memory ?? '',
    lastIp: patch.lastIp ?? existing?.lastIp ?? '',
    sysinfoAt: patch.sysinfoAt ?? existing?.sysinfoAt ?? null,
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
export interface SessionDetails {
  controllerName?: string
  ip?: string
  connType?: number | null
}

export async function openSession(params: {
  hostId: string
  connId: number
  controllerId: string
  details?: SessionDetails
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
    controllerName: params.details?.controllerName ?? existing?.controllerName ?? '',
    ip: params.details?.ip ?? existing?.ip ?? '',
    connType: params.details?.connType ?? existing?.connType ?? null,
  }
  await store.saveConnSession(session)
  return session
}

/**
 * Уточнение сессии из аудита клиента. Клиент RustDesk сообщает о подключении
 * в два приёма: сначала `action: new` с адресом, а после входа — запись с
 * `peer: [id, имя]` и видом подключения. Только тогда становится известна
 * управляющая сторона, и расход переписывается на неё.
 */
export async function describeSession(params: {
  hostId: string
  connId: number
  controllerId?: string
  details?: SessionDetails
  now?: Date
}): Promise<ConnSession> {
  const store = await getStore()
  const existing = await store.getConnSession(sessionKey(params.hostId, params.connId))
  if (!existing || existing.endedAt) {
    return openSession({
      hostId: params.hostId,
      connId: params.connId,
      controllerId: params.controllerId ?? '',
      details: params.details,
      now: params.now,
    })
  }

  let session: ConnSession = {
    ...existing,
    controllerName: params.details?.controllerName ?? existing.controllerName,
    ip: params.details?.ip ?? existing.ip,
    connType: params.details?.connType ?? existing.connType,
  }
  if (params.controllerId && params.controllerId !== existing.controllerId) {
    const subject = await resolveSubject(store, params.controllerId, params.hostId)
    session = { ...session, controllerId: params.controllerId, subjectKey: subject.key, userId: subject.userId }
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
  /** conn_id, которые клиент должен разорвать: исчерпано время или превышено число сессий. */
  disconnect: number[]
  states: QuotaState[]
  device: Device | null
}

/**
 * Обрабатывает один heartbeat управляемого устройства: начисляет секунды
 * активным сессиям, закрывает исчезнувшие и решает, кого отключить.
 */
export async function processHeartbeat(params: {
  hostId: string
  uuid?: string
  version?: string
  /** Адрес, с которого устройство вышло на связь. */
  ip?: string
  conns: number[]
  now?: Date
}): Promise<HeartbeatResult> {
  const store = await getStore()
  const now = params.now ?? new Date()
  const day = billingDay(now)
  const disconnect: number[] = []
  const states = new Map<string, QuotaState>()

  const device = await touchDevice(
    store,
    params.hostId,
    {
      uuid: params.uuid,
      version: params.version,
      ...(params.ip && params.ip !== 'unknown' ? { lastIp: params.ip } : {}),
    },
    now,
  )

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

  await enforceConcurrentLimit(store, params.hostId, states, disconnect, now)

  return { disconnect, states: [...states.values()], device }
}

/**
 * Лимит одновременных сессий.
 *
 * Работает на любом образе сервера: патч hbbs не пускает лишнее подключение
 * заранее, а здесь оно разрывается, даже если hbbs стоковый. Цена — лишняя
 * сессия успевает открыться и живёт до следующего heartbeat, до 15 секунд.
 *
 * Оставляем самые старые сессии, разрываем самые новые: человек, который уже
 * работает, не должен вылететь из-за того, что коллега открыл ещё одну.
 * Порядок общий для всех устройств аккаунта, поэтому лишние сессии на других
 * компьютерах разорвутся на их собственных heartbeat.
 */
async function enforceConcurrentLimit(
  store: Store,
  hostId: string,
  states: Map<string, QuotaState>,
  disconnect: number[],
  now: Date,
): Promise<void> {
  const cut = new Set(disconnect)
  // Сессия, по которой давно нет heartbeat (компьютер выключили без
  // завершения), не должна занимать место: её закроет closeStaleSessions.
  const staleBefore = now.getTime() - config.quota.staleSessionSeconds * 1000

  for (const state of states.values()) {
    if (state.exhausted) continue
    const active = (await store.listActiveConnSessions({ subjectKey: state.subjectKey }))
      .filter((session) => new Date(session.lastTickAt).getTime() >= staleBefore)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.key.localeCompare(b.key))
    if (active.length <= state.concurrentLimit) continue

    for (const session of active.slice(state.concurrentLimit)) {
      if (session.hostId !== hostId || cut.has(session.connId)) continue
      cut.add(session.connId)
      disconnect.push(session.connId)
      await store.saveConnSession({ ...session, endedAt: now.toISOString(), closeReason: 'concurrent_limit' })
    }
  }
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
