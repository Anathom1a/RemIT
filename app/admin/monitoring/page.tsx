import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { IncidentCreateForm, IncidentUpdateForm } from '@/components/admin/incident-forms'
import { config } from '@/lib/config'
import { isMailConfigured } from '@/lib/mail'
import { COMPONENTS, componentName, readMonitorState, visibleComponents } from '@/lib/monitoring'
import { INCIDENT_STATUS_LABEL, STATUS_LABEL, getPublicStatus } from '@/lib/status'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import type { MonitorStatus } from '@/lib/types'

export const metadata: Metadata = { title: 'Мониторинг' }
export const dynamic = 'force-dynamic'

const CHECK_STATUS: Record<MonitorStatus, { label: string; dot: string }> = {
  up: { label: 'работает', dot: 'bg-success' },
  degraded: { label: 'внимание', dot: 'bg-warning' },
  down: { label: 'сбой', dot: 'bg-danger' },
  unknown: { label: 'нет данных', dot: 'bg-white/30' },
}

export default async function AdminMonitoringPage() {
  const store = await getStore()
  const [state, events, incidents, status, devices, sessions] = await Promise.all([
    readMonitorState(),
    store.listMonitorEvents(40),
    store.listIncidents(20),
    getPublicStatus(),
    store.listDevices(2000),
    store.listActiveConnSessions({}),
  ])
  const checks = Object.values(state.checks).sort((a, b) => {
    const rank = { down: 0, degraded: 1, unknown: 2, up: 3 }
    return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name)
  })
  const online = devices.filter((device) => Date.now() - new Date(device.lastSeenAt).getTime() < 2 * 60_000).length
  const telegram = Boolean(config.notifications.telegramBotToken && (config.monitoring.alertTelegramChatId || config.notifications.telegramChatId))
  const emails = config.monitoring.alertEmails.length ? config.monitoring.alertEmails : config.admin.emails
  const open = incidents.filter((incident) => !incident.resolvedAt)
  const closed = incidents.filter((incident) => incident.resolvedAt).slice(0, 8)
  const names = new Map(checks.map((check) => [check.id, check.name]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Мониторинг</h1>
          <p className="mt-1 text-sm text-text-muted">
            Проверки каждые {config.monitoring.intervalSeconds} с
            {state.lastRunAt ? `, последняя — ${formatDateTime(state.lastRunAt)}` : ', ещё не запускались'} ·{' '}
            <a href="/status" className="text-brand-400 underline decoration-dotted">
              страница статуса
            </a>
            : {STATUS_LABEL[status.status].toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton endpoint="/api/v1/admin/monitoring" body={{ action: 'run' }} label="Проверить сейчас" />
          <ActionButton endpoint="/api/v1/admin/monitoring" body={{ action: 'test-alert' }} label="Тестовое оповещение" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-text-muted">Устройств онлайн</p>
          <p className="mt-1 text-2xl font-semibold">{online}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-text-muted">Идёт сессий</p>
          <p className="mt-1 text-2xl font-semibold">{sessions.length}</p>
        </div>
        <div className="card p-5 text-sm">
          <p className="text-text-muted">Оповещения</p>
          <p className="mt-1">Telegram: {telegram ? 'настроен' : <span className="text-warning">не настроен</span>}</p>
          <p>
            Почта:{' '}
            {isMailConfigured() && emails.length ? emails.join(', ') : <span className="text-warning">не настроена</span>}
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Проверки</h2>
        </div>
        <ul className="divide-y divide-white/8">
          {checks.length === 0 && <li className="px-6 py-6 text-sm text-text-muted">Проверок ещё не было.</li>}
          {checks.map((check) => (
            <li key={check.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-6 py-3">
              <span className="flex min-w-48 items-center gap-2 text-sm font-medium">
                <span className={`size-2 shrink-0 rounded-full ${CHECK_STATUS[check.status].dot}`} />
                {check.name}
              </span>
              <span className="min-w-0 flex-1 text-sm text-text-secondary">
                {CHECK_STATUS[check.status].label} с {formatDateTime(check.since)} · {check.detail}
                {check.pending && (
                  <span className="text-warning"> · ждёт подтверждения: {CHECK_STATUS[check.pending].label}</span>
                )}
              </span>
              <span className="text-xs text-text-muted">
                {check.component ? componentName(check.component) : 'служебная'} · {formatDateTime(check.checkedAt)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="font-semibold">Инциденты и плановые работы</h2>
        <p className="text-sm text-text-muted">
          Сбой компонента мониторинг публикует на странице статуса сам и сам закрывает при восстановлении. Здесь можно
          добавить подробности или объявить плановые работы — на их время оповещения по затронутым компонентам молчат.
        </p>
        {open.map((incident) => (
          <div key={incident.id} className="rounded-xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{incident.title}</span>
              <span className="pill !py-0.5 !text-xs">{INCIDENT_STATUS_LABEL[incident.status]}</span>
              {incident.auto && <span className="text-xs text-text-muted">создан мониторингом</span>}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {incident.components.map(componentName).join(', ')} · с {formatDateTime(incident.startsAt ?? incident.createdAt)}
              {incident.endsAt ? ` до ${formatDateTime(incident.endsAt)}` : ''}
            </p>
            <p className="mt-2 text-sm text-text-secondary">{incident.updates.at(-1)?.text}</p>
            <IncidentUpdateForm id={incident.id} maintenance={incident.impact === 'maintenance'} />
          </div>
        ))}
        <details className="rounded-xl border border-white/10 p-4" open={open.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">Новый инцидент или плановые работы</summary>
          <div className="mt-4">
            <IncidentCreateForm components={visibleComponents().map(({ id, name }) => ({ id, name }))} />
          </div>
        </details>
        {closed.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-text-secondary">Закрытые</h3>
            <ul className="mt-2 space-y-1 text-sm text-text-muted">
              {closed.map((incident) => (
                <li key={incident.id}>
                  {formatDateTime(incident.createdAt)} — {incident.title} ({INCIDENT_STATUS_LABEL[incident.status].toLowerCase()}{' '}
                  {formatDateTime(incident.resolvedAt)})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">События</h2>
        </div>
        <ul className="divide-y divide-white/8 text-sm">
          {events.length === 0 && <li className="px-6 py-6 text-text-muted">Изменений не было.</li>}
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap gap-x-3 px-6 py-2.5">
              <span className="text-text-muted">{formatDateTime(event.at)}</span>
              <span className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${CHECK_STATUS[event.status].dot}`} />
                {names.get(event.checkId) ?? (event.checkId === 'site' ? 'Сайт (сторож)' : event.checkId)}
              </span>
              <span className="min-w-0 flex-1 text-text-secondary">{event.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-text-muted">
        Компоненты страницы статуса: {COMPONENTS.map((component) => component.name).join(', ')}. Если лёг сам сайт, об
        этом оповестит сторож (контейнер watchdog) и внешний мониторинг — docs/MONITORING.md.
      </p>
    </div>
  )
}
