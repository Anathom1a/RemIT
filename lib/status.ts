import { getStore } from './store'
import { billingDay } from './time'
import {
  maintenanceActive,
  readMonitorState,
  visibleComponents,
  type ComponentId,
} from './monitoring'
import type { Incident, IncidentStatus, MonitorStatus } from './types'

/**
 * Публичная страница статуса: что показываем людям. Только состояние
 * компонентов, доступность и инциденты — без адресов, ошибок и имён узлов.
 */

export type PublicStatus = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown'

export interface UptimeDay {
  day: string
  /** Доля успешных проверок, 0–1; null — данных нет. */
  uptime: number | null
}

export interface PublicComponent {
  id: ComponentId
  name: string
  description: string
  status: PublicStatus
  /** Доступность за 90 дней. */
  uptime90: number | null
  days: UptimeDay[]
}

export interface PublicIncident {
  id: string
  title: string
  impact: Incident['impact']
  status: IncidentStatus
  components: string[]
  createdAt: string
  resolvedAt: string | null
  startsAt: string | null
  endsAt: string | null
  updates: Incident['updates']
}

export interface PublicStatusPage {
  status: PublicStatus
  updatedAt: string | null
  components: PublicComponent[]
  active: PublicIncident[]
  upcoming: PublicIncident[]
  history: PublicIncident[]
}

export const STATUS_LABEL: Record<PublicStatus, string> = {
  operational: 'Работает',
  degraded: 'Частичные сбои',
  outage: 'Не работает',
  maintenance: 'Плановые работы',
  unknown: 'Нет данных',
}

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: 'Разбираемся',
  identified: 'Причина найдена',
  monitoring: 'Наблюдаем',
  resolved: 'Решено',
  scheduled: 'Запланировано',
  in_progress: 'Идут работы',
  completed: 'Завершено',
}

const FROM_MONITOR: Record<MonitorStatus, PublicStatus> = {
  up: 'operational',
  degraded: 'degraded',
  down: 'outage',
  unknown: 'unknown',
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Мониторинг молчит дольше — считаем данные устаревшими. */
const STALE_MS = 5 * 60 * 1000

const publicIncident = (incident: Incident): PublicIncident => ({
  id: incident.id,
  title: incident.title,
  impact: incident.impact,
  status: incident.status,
  components: incident.components,
  createdAt: incident.createdAt,
  resolvedAt: incident.resolvedAt,
  startsAt: incident.startsAt,
  endsAt: incident.endsAt,
  updates: incident.updates,
})

export function lastDays(count: number, now = new Date()): string[] {
  const days: string[] = []
  for (let index = count - 1; index >= 0; index -= 1) days.push(billingDay(new Date(now.getTime() - index * DAY_MS)))
  return [...new Set(days)]
}

export async function getPublicStatus(now = new Date()): Promise<PublicStatusPage> {
  const store = await getStore()
  const [state, incidents] = await Promise.all([readMonitorState(), store.listIncidents(60)])
  const days = lastDays(90, now)
  const stats = await store.listMonitorDays(days[0])
  const fresh = state.lastRunAt !== null && now.getTime() - new Date(state.lastRunAt).getTime() < STALE_MS

  const maintenance = new Set(
    incidents.filter((incident) => maintenanceActive(incident, now)).flatMap((incident) => incident.components),
  )

  const components: PublicComponent[] = visibleComponents().map((component) => {
    const monitored: MonitorStatus = fresh ? (state.components[component.id] ?? 'unknown') : 'unknown'
    const status: PublicStatus = maintenance.has(component.id) ? 'maintenance' : FROM_MONITOR[monitored]
    const byDay = new Map(stats.filter((row) => row.key === `c:${component.id}`).map((row) => [row.day, row]))
    let ok = 0
    let total = 0
    const history = days.map((day) => {
      const row = byDay.get(day)
      if (!row || row.total === 0) return { day, uptime: null }
      ok += row.ok
      total += row.total
      return { day, uptime: row.ok / row.total }
    })
    return { ...component, status, uptime90: total ? ok / total : null, days: history }
  })

  const statuses = components.map((component) => component.status)
  const status: PublicStatus = statuses.includes('outage')
    ? 'outage'
    : statuses.includes('degraded')
      ? 'degraded'
      : statuses.includes('maintenance')
        ? 'maintenance'
        : statuses.every((item) => item === 'unknown')
          ? 'unknown'
          : 'operational'

  const since = now.getTime() - 14 * DAY_MS
  const open = incidents.filter((incident) => !incident.resolvedAt)
  return {
    status,
    updatedAt: state.lastRunAt,
    components,
    active: open
      .filter((incident) => incident.impact !== 'maintenance' || maintenanceActive(incident, now))
      .map(publicIncident),
    upcoming: open
      .filter((incident) => incident.impact === 'maintenance' && !maintenanceActive(incident, now))
      .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
      .map(publicIncident),
    history: incidents
      .filter((incident) => incident.resolvedAt && new Date(incident.resolvedAt).getTime() >= since)
      .map(publicIncident),
  }
}

/** Что показать баннером в кабинете: идущий сбой, работы сейчас или в ближайшие сутки. */
export async function cabinetNotice(now = new Date()): Promise<{ tone: 'warning' | 'info'; text: string } | null> {
  const store = await getStore()
  const open = (await store.listIncidents(20)).filter((incident) => !incident.resolvedAt)
  const outage = open.find((incident) => incident.impact !== 'maintenance')
  if (outage) return { tone: 'warning', text: `${outage.title}. ${outage.updates.at(-1)?.text ?? ''}`.trim() }
  const running = open.find((incident) => maintenanceActive(incident, now))
  if (running) return { tone: 'info', text: `Идут плановые работы: ${running.title}.` }
  const soon = open.find(
    (incident) =>
      incident.impact === 'maintenance' &&
      incident.startsAt &&
      new Date(incident.startsAt).getTime() - now.getTime() < DAY_MS &&
      new Date(incident.startsAt).getTime() > now.getTime(),
  )
  if (soon?.startsAt) {
    const time = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(soon.startsAt))
    return { tone: 'info', text: `Плановые работы ${time} (мск): ${soon.title}.` }
  }
  return null
}
