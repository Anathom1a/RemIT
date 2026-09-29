import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from './config'
import { getStore } from './store'
import { escapeHtml, isMailConfigured, sendMail, verifyMail } from './mail'
import { notifyTelegram } from './notify'
import { lastBillingJobs } from './billing-jobs'
import { readBackupState } from './backups'
import { listRelays, MAIN_RELAY_ID, probeTcp, probeTls } from './relays'
import { pingYookassa, yookassaConfigured, YookassaError } from './yookassa'
import { billingDay, formatDateTime } from './time'
import type { Incident, MonitorEvent, MonitorStatus } from './types'

/**
 * Мониторинг. Раз в минуту (lib/scheduler.ts) сайт проверяет всё, от чего
 * зависит сервис: базу, сервер ID, ретрансляторы, WebSocket веб-клиента,
 * сертификаты, ЮKassa, почту, диск, фоновые задачи оплаты.
 *
 *   - Сбой подтверждается двумя проверками подряд, чтобы не будить
 *     администратора из-за одного потерянного пакета.
 *   - О сбое и восстановлении — оповещение в Telegram и на почту.
 *   - Если компонент страницы статуса лёг, там сам появляется инцидент и
 *     сам закрывается при восстановлении.
 *   - На время плановых работ оповещения по затронутым компонентам молчат,
 *     а простой не портит статистику доступности.
 *
 * Сам себя сайт проверить не может: если он лёг, оповестит сторож
 * (server/monitor/watchdog.sh) и внешний мониторинг — см. docs/MONITORING.md.
 */

/* ----------------------------------------------------------- компоненты -- */

export type ComponentId = 'site' | 'connect' | 'relay' | 'webclient' | 'payments'

export interface ComponentDef {
  id: ComponentId
  name: string
  description: string
}

export const COMPONENTS: ComponentDef[] = [
  { id: 'site', name: 'Сайт и личный кабинет', description: 'Регистрация, вход, подписка, вход в клиенте' },
  { id: 'connect', name: 'Подключение к компьютерам', description: 'Сервер ID: клиенты находят друг друга' },
  { id: 'relay', name: 'Ретрансляция', description: 'Соединение через наш сервер, когда напрямую не получается' },
  { id: 'webclient', name: 'Веб-клиент', description: 'Подключение из браузера' },
  { id: 'payments', name: 'Приём оплаты', description: 'Оплата картой и СБП через ЮKassa' },
]

/** Компоненты, которые показываем: оплата — только если она через ЮKassa. */
export function visibleComponents(): ComponentDef[] {
  return COMPONENTS.filter((component) => component.id !== 'payments' || config.billing.provider === 'yookassa')
}

export const componentName = (id: string) => COMPONENTS.find((component) => component.id === id)?.name ?? id

/* -------------------------------------------------------------- проверки -- */

export interface CheckResult {
  /** skip — проверка сейчас не применима (например, почта не настроена). */
  status: 'up' | 'degraded' | 'down' | 'skip'
  detail: string
  latencyMs?: number
}

interface CheckDef {
  id: string
  name: string
  component: ComponentId | null
  /** Как часто проверять. */
  everyMs: number
  /** Сколько провалов подряд нужно, чтобы признать сбой. */
  confirm: number
  run: () => Promise<CheckResult>
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const tcp = async (address: string): Promise<CheckResult> => {
  const probe = await probeTcp(address, 4000)
  return { status: probe.ok ? 'up' : 'down', detail: probe.detail, latencyMs: probe.ms }
}

/** Сертификат: TLS принят и до истечения больше certWarnDays. */
async function certificate(host: string, port: number): Promise<CheckResult> {
  const probe = await probeTls(`${host}:${port}`, 5000, 0)
  if (!probe.ok) return { status: 'down', detail: probe.detail, latencyMs: probe.ms }
  if (probe.daysLeft !== undefined && probe.daysLeft < config.monitoring.certWarnDays) {
    return { status: probe.daysLeft < 3 ? 'down' : 'degraded', detail: probe.detail, latencyMs: probe.ms }
  }
  return { status: 'up', detail: probe.detail, latencyMs: probe.ms }
}

async function databaseCheck(): Promise<CheckResult> {
  const started = Date.now()
  const store = await getStore()
  await store.ping()
  const ms = Date.now() - started
  return { status: ms > 2000 ? 'degraded' : 'up', detail: `отвечает за ${ms} мс`, latencyMs: ms }
}

async function diskCheck(): Promise<CheckResult> {
  const dirs = [config.storage.releasesDir, config.storage.attachmentsDir]
  if (!config.database.url) dirs.push(path.dirname(config.database.file))
  let worst: CheckResult | null = null
  for (const dir of new Set(dirs.map((item) => path.resolve(item)))) {
    let stats
    try {
      stats = await fs.statfs(dir)
    } catch {
      continue // каталога ещё нет
    }
    const free = stats.bavail * stats.bsize
    const share = stats.blocks > 0 ? stats.bavail / stats.blocks : 1
    const gb = free / 1024 ** 3
    const detail = `свободно ${gb.toFixed(1)} ГБ (${Math.round(share * 100)}%) на ${dir}`
    const status: CheckResult['status'] =
      share < 0.03 || free < 500 * 1024 ** 2 ? 'down' : share < 0.1 || free < 2 * 1024 ** 3 ? 'degraded' : 'up'
    const rank = { up: 0, skip: 0, degraded: 1, down: 2 }
    if (!worst || rank[status] > rank[worst.status]) worst = { status, detail }
  }
  return worst ?? { status: 'skip', detail: '' }
}

async function paymentsCheck(): Promise<CheckResult> {
  if (config.billing.provider !== 'yookassa') return { status: 'skip', detail: '' }
  if (!yookassaConfigured()) return { status: 'down', detail: 'не заданы YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY' }
  const started = Date.now()
  try {
    await pingYookassa()
    return { status: 'up', detail: 'API ЮKassa отвечает', latencyMs: Date.now() - started }
  } catch (error) {
    const detail =
      error instanceof YookassaError && (error.status === 401 || error.status === 403)
        ? 'ЮKassa не принимает ключи магазина'
        : (error as Error).message
    return { status: 'down', detail, latencyMs: Date.now() - started }
  }
}

async function billingJobsCheck(): Promise<CheckResult> {
  if (config.billing.provider !== 'yookassa' || !yookassaConfigured()) return { status: 'skip', detail: '' }
  const last = await lastBillingJobs()
  if (!last) return { status: 'up', detail: 'ещё не запускались после старта' }
  if (last.report.errors.length) {
    return { status: 'degraded', detail: `ошибок: ${last.report.errors.length}; ${last.report.errors[0]}` }
  }
  return { status: 'up', detail: `последний запуск ${formatDateTime(last.at)}` }
}

async function mailCheck(): Promise<CheckResult> {
  if (!isMailConfigured()) return { status: 'skip', detail: '' }
  const started = Date.now()
  try {
    await verifyMail()
    return { status: 'up', detail: 'SMTP принимает вход', latencyMs: Date.now() - started }
  } catch (error) {
    return { status: 'down', detail: (error as Error).message, latencyMs: Date.now() - started }
  }
}

const STARTED_AT = Date.now()

/**
 * Резервные копии: последняя успешная (с проверкой восстановления) — не
 * старше 26 часов и ушла во внешнее хранилище.
 */
async function backupCheck(): Promise<CheckResult> {
  const state = await readBackupState()
  if (!state) {
    // Контейнер backup делает копию сразу при старте; даём ему время.
    if (Date.now() - STARTED_AT < 2 * HOUR) return { status: 'skip', detail: '' }
    return { status: 'down', detail: 'ни одной копии: проверьте контейнер backup' }
  }
  if (!state.ok) return { status: 'down', detail: `последняя копия не удалась: ${state.error}` }
  const age = state.lastOkAt ? Date.now() - new Date(state.lastOkAt).getTime() : Infinity
  if (age > 26 * HOUR) return { status: 'down', detail: `свежих копий нет с ${state.lastOkAt ? formatDateTime(state.lastOkAt) : '—'}` }
  if (!state.lastOkRemote) {
    return { status: 'degraded', detail: `${state.lastOkFile} — только на этом сервере: настройте BACKUP_S3_*` }
  }
  return { status: 'up', detail: `${state.lastOkFile}, проверена, во внешнем хранилище` }
}

/** Проверки на сейчас: список ретрансляторов меняется из админки. */
async function buildChecks(): Promise<CheckDef[]> {
  // Частые проверки идут с каждым проходом планировщика (REMIT_MONITOR_INTERVAL).
  const TICK = Math.max(10, config.monitoring.intervalSeconds) * 1000
  const checks: CheckDef[] = [
    { id: 'database', name: 'База данных', component: 'site', everyMs: TICK, confirm: 2, run: databaseCheck },
    {
      id: 'hbbs',
      name: 'Сервер ID (hbbs)',
      component: 'connect',
      everyMs: TICK,
      confirm: 2,
      run: () => tcp(config.rustdesk.hbbsInternal),
    },
    {
      id: 'hbbs-ws',
      name: 'WebSocket сервера ID',
      component: 'webclient',
      everyMs: TICK,
      confirm: 2,
      run: () => tcp(config.rustdesk.hbbsWs),
    },
    {
      id: 'hbbr-ws',
      name: 'WebSocket ретранслятора',
      component: 'webclient',
      everyMs: TICK,
      confirm: 2,
      run: () => tcp(config.rustdesk.hbbrWs),
    },
    {
      id: 'tls-site',
      name: `Сертификат ${config.brand.domain}`,
      component: null,
      everyMs: HOUR,
      confirm: 1,
      run: () => certificate(config.brand.domain, 443),
    },
    { id: 'payments', name: 'ЮKassa', component: 'payments', everyMs: 5 * MINUTE, confirm: 2, run: paymentsCheck },
    { id: 'billing-jobs', name: 'Автопродление и чеки', component: null, everyMs: 10 * MINUTE, confirm: 1, run: billingJobsCheck },
    { id: 'mail', name: 'Почта (SMTP)', component: null, everyMs: 15 * MINUTE, confirm: 1, run: mailCheck },
    { id: 'disk', name: 'Место на диске', component: null, everyMs: 10 * MINUTE, confirm: 1, run: diskCheck },
    { id: 'backup', name: 'Резервные копии', component: null, everyMs: 10 * MINUTE, confirm: 1, run: backupCheck },
  ]

  for (const relay of await listRelays()) {
    if (!relay.enabled) continue
    const isMain = relay.id === MAIN_RELAY_ID
    checks.push({
      id: `relay:${relay.id}`,
      name: `Ретранслятор ${relay.name}`,
      component: 'relay',
      everyMs: TICK,
      confirm: 2,
      // Основной — по внутренней сети: снаружи сервер сам себя может не увидеть.
      run: () => tcp(isMain ? config.rustdesk.hbbrCommand : relay.address),
    })
    if (!isMain && !/^\d+\.\d+\.\d+\.\d+:/.test(relay.address)) {
      const [host, port] = relay.address.split(':')
      checks.push({
        id: `relay-tls:${relay.id}`,
        name: `Сертификат ретранслятора ${relay.name}`,
        component: 'webclient',
        everyMs: HOUR,
        confirm: 1,
        run: () => certificate(host, Number(port) + 2),
      })
    }
  }
  return checks
}

/* -------------------------------------------------------------- состояние -- */

export interface CheckState {
  id: string
  name: string
  component: ComponentId | null
  /** Подтверждённое состояние. */
  status: MonitorStatus
  since: string
  checkedAt: string
  latencyMs: number | null
  detail: string
  /** Новое состояние, которое ещё ждёт подтверждения. */
  pending: MonitorStatus | null
  pendingCount: number
}

export interface MonitorState {
  lastRunAt: string | null
  checks: Record<string, CheckState>
  components: Record<string, MonitorStatus>
  lastPurgeDay: string | null
}

const STATE_KEY = 'monitor_state'

export async function readMonitorState(): Promise<MonitorState> {
  const store = await getStore()
  const raw = (await store.getSettings())[STATE_KEY]
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<MonitorState>) : {}
    return {
      lastRunAt: parsed.lastRunAt ?? null,
      checks: parsed.checks ?? {},
      components: parsed.components ?? {},
      lastPurgeDay: parsed.lastPurgeDay ?? null,
    }
  } catch {
    return { lastRunAt: null, checks: {}, components: {}, lastPurgeDay: null }
  }
}

async function writeMonitorState(state: MonitorState): Promise<void> {
  const store = await getStore()
  await store.setSetting(STATE_KEY, JSON.stringify(state))
}

const RANK: Record<MonitorStatus, number> = { up: 0, unknown: 0, degraded: 1, down: 2 }

/* -------------------------------------------------------- плановые работы -- */

/** Идут ли плановые работы по инциденту прямо сейчас. */
export function maintenanceActive(incident: Incident, now = new Date()): boolean {
  if (incident.impact !== 'maintenance' || incident.resolvedAt) return false
  if (incident.status === 'in_progress') return true
  if (incident.status !== 'scheduled' || !incident.startsAt) return false
  return new Date(incident.startsAt).getTime() <= now.getTime() && (!incident.endsAt || new Date(incident.endsAt).getTime() > now.getTime())
}

/** Работы по расписанию сами начинаются и сами завершаются. */
async function advanceMaintenance(incidents: Incident[], now: Date): Promise<void> {
  const store = await getStore()
  for (const incident of incidents) {
    if (incident.impact !== 'maintenance' || incident.resolvedAt) continue
    const starts = incident.startsAt ? new Date(incident.startsAt).getTime() : null
    const ends = incident.endsAt ? new Date(incident.endsAt).getTime() : null
    if (incident.status === 'scheduled' && starts !== null && starts <= now.getTime()) {
      incident.status = 'in_progress'
      incident.updates.push({ at: now.toISOString(), status: 'in_progress', text: 'Работы начались.' })
      await store.saveIncident(incident)
    }
    if (incident.status === 'in_progress' && ends !== null && ends <= now.getTime()) {
      incident.status = 'completed'
      incident.resolvedAt = now.toISOString()
      incident.updates.push({ at: now.toISOString(), status: 'completed', text: 'Работы завершены.' })
      await store.saveIncident(incident)
    }
  }
}

/* ------------------------------------------------------------ оповещения -- */

interface Alert {
  level: 'down' | 'degraded' | 'up'
  name: string
  detail: string
  /** Для восстановления: сколько длился сбой. */
  downtimeMs?: number
}

function minutesText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  return `${hours} ч ${minutes % 60} мин`
}

function alertLine(alert: Alert): string {
  if (alert.level === 'down') return `🔴 Сбой: ${alert.name} — ${alert.detail}`
  if (alert.level === 'degraded') return `🟡 Внимание: ${alert.name} — ${alert.detail}`
  return `🟢 Восстановлено: ${alert.name}${alert.downtimeMs ? `, простой ${minutesText(alert.downtimeMs)}` : ''}`
}

/** Шлёт оповещение в Telegram и на почту. Возвращает, куда удалось отправить. */
export async function sendAlert(lines: string[]): Promise<{ telegram: boolean; email: boolean }> {
  const title = `${config.brand.name}: мониторинг`
  const telegram = await notifyTelegram(
    `<b>${escapeHtml(title)}</b>\n${lines.map(escapeHtml).join('\n')}\n\n${escapeHtml(`https://${config.brand.domain}/admin/monitoring`)}`,
    config.monitoring.alertTelegramChatId || undefined,
  )
  const recipients = config.monitoring.alertEmails.length ? config.monitoring.alertEmails : config.admin.emails
  let email = false
  for (const to of recipients) {
    const text = `${lines.join('\n')}\n\nПодробности: https://${config.brand.domain}/admin/monitoring`
    const html = `<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;color:#1a1d21;line-height:1.5">
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')}
<p><a href="https://${escapeHtml(config.brand.domain)}/admin/monitoring">Открыть мониторинг</a></p></body></html>`
    const subject = lines.some((line) => line.startsWith('🔴'))
      ? `${config.brand.name}: сбой`
      : lines.some((line) => line.startsWith('🟡'))
        ? `${config.brand.name}: требует внимания`
        : `${config.brand.name}: восстановлено`
    email = (await sendMail({ to, subject, text, html })) || email
  }
  return { telegram, email }
}

/* ------------------------------------------------------------------ запуск -- */

export interface MonitorRunReport {
  at: string
  checks: number
  changes: number
  alerts: string[]
}

let running: Promise<MonitorRunReport> | null = null

/** Один проход мониторинга. Параллельный вызов дождётся текущего. */
export async function runMonitoring(now = new Date()): Promise<MonitorRunReport> {
  if (running) return running
  running = runOnce(now)
  try {
    return await running
  } finally {
    running = null
  }
}

async function withTimeout(promise: Promise<CheckResult>, ms: number): Promise<CheckResult> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<CheckResult>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'down', detail: `нет ответа за ${ms / 1000} с` }), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function runOnce(now: Date): Promise<MonitorRunReport> {
  const store = await getStore()
  const state = await readMonitorState()
  const checks = await buildChecks()
  const nowIso = now.toISOString()
  const day = billingDay(now)
  const alerts: Alert[] = []
  const events: MonitorEvent[] = []

  // Плановые работы: какие компоненты сейчас на обслуживании.
  const incidents = await store.listIncidents(50)
  await advanceMaintenance(incidents, now)
  const maintenance = new Set(incidents.filter((incident) => maintenanceActive(incident, now)).flatMap((incident) => incident.components))

  const due = checks.filter((check) => {
    const previous = state.checks[check.id]
    return !previous || now.getTime() - new Date(previous.checkedAt).getTime() >= check.everyMs - 5000
  })
  const results = await Promise.all(
    due.map(async (check) => {
      try {
        return [check, await withTimeout(check.run(), 10_000)] as const
      } catch (error) {
        return [check, { status: 'down', detail: (error as Error).message } as CheckResult] as const
      }
    }),
  )

  for (const [check, result] of results) {
    if (result.status === 'skip') {
      delete state.checks[check.id]
      continue
    }
    const previous: CheckState = state.checks[check.id] ?? {
      id: check.id,
      name: check.name,
      component: check.component,
      status: 'unknown',
      since: nowIso,
      checkedAt: nowIso,
      latencyMs: null,
      detail: '',
      pending: null,
      pendingCount: 0,
    }
    const next: CheckState = {
      ...previous,
      name: check.name,
      component: check.component,
      checkedAt: nowIso,
      latencyMs: result.latencyMs ?? null,
      detail: result.detail,
    }
    const observed: MonitorStatus = result.status
    if (observed === previous.status) {
      next.pending = null
      next.pendingCount = 0
    } else {
      next.pendingCount = previous.pending === observed ? previous.pendingCount + 1 : 1
      next.pending = observed
      // Первое наблюдение и восстановление подтверждать не нужно.
      const needed = observed === 'down' && previous.status !== 'unknown' ? check.confirm : 1
      if (next.pendingCount >= needed) {
        next.status = observed
        next.since = nowIso
        next.pending = null
        next.pendingCount = 0
        events.push({ id: randomUUID(), checkId: check.id, at: nowIso, status: observed, detail: result.detail })
        const quiet = check.component !== null && maintenance.has(check.component)
        if (!quiet) {
          if (observed === 'down' || observed === 'degraded') {
            alerts.push({ level: observed, name: check.name, detail: result.detail })
          } else if (previous.status === 'down' || previous.status === 'degraded') {
            alerts.push({
              level: 'up',
              name: check.name,
              detail: result.detail,
              downtimeMs: now.getTime() - new Date(previous.since).getTime(),
            })
          }
        }
      }
    }
    state.checks[check.id] = next
  }

  // Проверки, которых больше нет (ретранслятор выключили или удалили).
  const ids = new Set(checks.map((check) => check.id))
  for (const id of Object.keys(state.checks)) if (!ids.has(id)) delete state.checks[id]

  // Статистика доступности: только по тем, что проверялись в этот проход.
  const samples: { key: string; day: string; ok: boolean }[] = results
    .filter(([check]) => state.checks[check.id])
    .map(([check]) => ({ key: check.id, day, ok: state.checks[check.id].status !== 'down' }))

  // Компоненты страницы статуса.
  for (const component of visibleComponents()) {
    const status = componentStatus(component.id, Object.values(state.checks))
    const previous = state.components[component.id] ?? 'unknown'
    state.components[component.id] = status
    if (status === 'unknown') continue
    // Простой во время плановых работ не портит доступность.
    if (!maintenance.has(component.id)) samples.push({ key: `c:${component.id}`, day, ok: status !== 'down' })
    if (status === 'down' && previous !== 'down' && !maintenance.has(component.id)) {
      await openAutoIncident(component.id, incidents, now)
    } else if (status !== 'down' && previous === 'down') {
      await resolveAutoIncident(component.id, incidents, now)
    }
  }

  state.lastRunAt = nowIso
  // Раз в сутки чистим историю старше 100 дней.
  if (state.lastPurgeDay !== day) {
    const cutoff = new Date(now.getTime() - 100 * DAY)
    await store.purgeMonitor(billingDay(cutoff), cutoff.toISOString())
    state.lastPurgeDay = day
  }
  await writeMonitorState(state)
  await store.addMonitorSamples(samples)
  for (const event of events) await store.addMonitorEvent(event)

  const lines = alerts.map(alertLine)
  if (lines.length) await sendAlert(lines)
  return { at: nowIso, checks: results.length, changes: events.length, alerts: lines }
}

/** Состояние компонента по его проверкам. */
export function componentStatus(id: ComponentId, checks: CheckState[]): MonitorStatus {
  const own = checks.filter((check) => check.component === id && check.status !== 'unknown')
  if (own.length === 0) return 'unknown'
  if (id === 'relay') {
    // Ретрансляторов несколько: пока жив хоть один, соединения идут.
    const relays = own.filter((check) => check.id.startsWith('relay:'))
    const down = relays.filter((check) => check.status === 'down').length
    if (relays.length && down === relays.length) return 'down'
    if (down > 0 || own.some((check) => check.status === 'degraded')) return 'degraded'
    return 'up'
  }
  if (id === 'webclient') {
    // Сертификат отдельного ретранслятора — частичная проблема, не отказ.
    const core = own.filter((check) => !check.id.startsWith('relay-tls:'))
    if (core.some((check) => check.status === 'down')) return 'down'
    if (own.some((check) => check.status !== 'up')) return 'degraded'
    return 'up'
  }
  return own.reduce<MonitorStatus>((worst, check) => (RANK[check.status] > RANK[worst] ? check.status : worst), 'up')
}

async function openAutoIncident(component: ComponentId, incidents: Incident[], now: Date) {
  if (incidents.some((incident) => !incident.resolvedAt && incident.auto && incident.components.includes(component))) return
  const store = await getStore()
  const incident: Incident = {
    id: `inc_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    title: `${componentName(component)}: нарушена работа`,
    impact: 'major',
    status: 'investigating',
    components: [component],
    auto: true,
    createdAt: now.toISOString(),
    resolvedAt: null,
    startsAt: null,
    endsAt: null,
    updates: [{ at: now.toISOString(), status: 'investigating', text: 'Мониторинг зафиксировал сбой. Мы уже разбираемся.' }],
  }
  await store.saveIncident(incident)
  incidents.unshift(incident)
}

async function resolveAutoIncident(component: ComponentId, incidents: Incident[], now: Date) {
  const store = await getStore()
  for (const incident of incidents) {
    if (incident.resolvedAt || !incident.auto || !incident.components.includes(component)) continue
    incident.status = 'resolved'
    incident.resolvedAt = now.toISOString()
    incident.updates.push({ at: now.toISOString(), status: 'resolved', text: 'Работа восстановлена.' })
    await store.saveIncident(incident)
  }
}

/* ------------------------------------------------------ простой сайта -- */

/**
 * Сторож сообщает о простое сайта после восстановления: пока сайт лежал,
 * записать было некуда. Простой попадает в доступность «Сайта», в события
 * и, если длился от 3 минут, — в историю инцидентов на странице статуса.
 */
export async function recordSiteOutage(from: Date, to: Date): Promise<void> {
  const store = await getStore()
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / MINUTE))
  // Простой раскладываем по суткам.
  let cursor = from.getTime()
  while (cursor < to.getTime()) {
    const dayStart = new Date(cursor)
    const dayKey = billingDay(dayStart)
    let end = cursor
    while (end < to.getTime() && billingDay(new Date(end)) === dayKey) end += MINUTE
    const chunk = Math.max(1, Math.round((Math.min(end, to.getTime()) - cursor) / MINUTE))
    await store.addMonitorCounts('c:site', dayKey, 0, chunk)
    cursor = end
  }
  await store.addMonitorEvent({ id: randomUUID(), checkId: 'site', at: from.toISOString(), status: 'down', detail: 'сайт не отвечал (сообщил сторож)' })
  await store.addMonitorEvent({ id: randomUUID(), checkId: 'site', at: to.toISOString(), status: 'up', detail: `простой ${minutesText(minutes * MINUTE)}` })
  if (minutes >= 3) {
    await store.saveIncident({
      id: `inc_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      title: 'Сайт и личный кабинет были недоступны',
      impact: 'major',
      status: 'resolved',
      components: ['site'],
      auto: true,
      createdAt: from.toISOString(),
      resolvedAt: to.toISOString(),
      startsAt: null,
      endsAt: null,
      updates: [
        { at: from.toISOString(), status: 'investigating', text: 'Сайт перестал отвечать.' },
        { at: to.toISOString(), status: 'resolved', text: `Работа восстановлена, простой ${minutesText(minutes * MINUTE)}.` },
      ],
    })
  }
}
