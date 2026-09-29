import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { pageMetadata } from '@/lib/seo'
import { config } from '@/lib/config'
import { componentName } from '@/lib/monitoring'
import {
  INCIDENT_STATUS_LABEL,
  STATUS_LABEL,
  getPublicStatus,
  type PublicIncident,
  type PublicStatus,
  type UptimeDay,
} from '@/lib/status'
import { formatDateTime } from '@/lib/time'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  title: 'Статус сервиса',
  description: `Работает ли ${config.brand.name} прямо сейчас: сайт, подключение к компьютерам, ретрансляция, веб-клиент и оплата. Доступность за 90 дней и история инцидентов.`,
  path: '/status',
})

const HEADLINE: Record<PublicStatus, string> = {
  operational: 'Все системы работают',
  degraded: 'Частичные сбои',
  outage: 'Сбой в работе сервиса',
  maintenance: 'Идут плановые работы',
  unknown: 'Данные мониторинга временно недоступны',
}

const TONE: Record<PublicStatus, { dot: string; text: string; border: string }> = {
  operational: { dot: 'bg-success', text: 'text-success', border: 'border-success/30' },
  degraded: { dot: 'bg-warning', text: 'text-warning', border: 'border-warning/30' },
  outage: { dot: 'bg-danger', text: 'text-danger', border: 'border-danger/40' },
  maintenance: { dot: 'bg-brand-400', text: 'text-brand-400', border: 'border-brand-500/40' },
  unknown: { dot: 'bg-white/30', text: 'text-text-muted', border: 'border-white/10' },
}

function barColor(day: UptimeDay): string {
  if (day.uptime === null) return 'bg-white/10'
  if (day.uptime >= 0.999) return 'bg-success'
  if (day.uptime >= 0.99) return 'bg-success/60'
  if (day.uptime >= 0.95) return 'bg-warning'
  return 'bg-danger'
}

const percent = (value: number | null) =>
  value === null ? '—' : `${(Math.floor(value * 10000) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}%`

function dayLabel(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

function IncidentCard({ incident }: { incident: PublicIncident }) {
  const maintenance = incident.impact === 'maintenance'
  const tone = maintenance ? TONE.maintenance : incident.resolvedAt ? TONE.operational : incident.impact === 'major' ? TONE.outage : TONE.degraded
  return (
    <article className={`card border ${tone.border} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{incident.title}</h3>
        <span className={`pill !py-0.5 !text-xs ${tone.text}`}>{INCIDENT_STATUS_LABEL[incident.status]}</span>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {incident.components.map(componentName).join(', ')}
        {maintenance && incident.startsAt
          ? ` · ${formatDateTime(incident.startsAt)}${incident.endsAt ? ` — ${formatDateTime(incident.endsAt)}` : ''}`
          : ''}
      </p>
      <ol className="mt-4 space-y-3 border-l border-white/10 pl-4">
        {[...incident.updates].reverse().map((update) => (
          <li key={`${update.at}-${update.status}`} className="text-sm">
            <span className="font-medium text-text-primary">{INCIDENT_STATUS_LABEL[update.status]}</span>
            <span className="text-text-muted"> · {formatDateTime(update.at)}</span>
            <p className="mt-0.5 whitespace-pre-line leading-relaxed text-text-secondary">{update.text}</p>
          </li>
        ))}
      </ol>
    </article>
  )
}

export default async function StatusPage() {
  const page = await getPublicStatus()
  const tone = TONE[page.status]

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-8 px-5 py-12 sm:py-16">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Статус сервиса</h1>
          <p className="mt-3 text-text-secondary">
            Состояние {config.brand.name} прямо сейчас. Проверяем каждую минуту.
          </p>
        </div>

        <section className={`card flex items-center gap-4 border ${tone.border} p-5 sm:p-6`}>
          <span className={`size-3 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-lg font-semibold">{HEADLINE[page.status]}</p>
            <p className="text-sm text-text-muted">
              {page.updatedAt ? `Обновлено ${formatDateTime(page.updatedAt)}` : 'Проверок ещё не было'}
            </p>
          </div>
        </section>

        {page.active.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Сейчас</h2>
            {page.active.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </section>
        )}

        {page.upcoming.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Плановые работы</h2>
            {page.upcoming.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </section>
        )}

        <section className="card divide-y divide-white/8">
          {page.components.map((component) => {
            const componentTone = TONE[component.status]
            return (
              <div key={component.id} className="space-y-3 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium">{component.name}</h3>
                    <p className="text-xs text-text-muted">{component.description}</p>
                  </div>
                  <span className={`flex items-center gap-2 text-sm ${componentTone.text}`}>
                    <span className={`size-2 rounded-full ${componentTone.dot}`} aria-hidden />
                    {STATUS_LABEL[component.status]}
                  </span>
                </div>
                <div
                  className="flex h-8 items-stretch gap-px"
                  role="img"
                  aria-label={`Доступность «${component.name}» за 90 дней: ${percent(component.uptime90)}`}
                >
                  {component.days.map((day, index) => (
                    <span
                      key={day.day}
                      title={`${dayLabel(day.day)} — ${day.uptime === null ? 'нет данных' : percent(day.uptime)}`}
                      // На телефоне — последние 30 дней, иначе полоски слишком тонкие.
                      className={`min-w-0 flex-1 rounded-[2px] ${barColor(day)} ${index < component.days.length - 30 ? 'hidden sm:block' : ''}`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-text-muted">
                  <span>
                    <span className="sm:hidden">30 дней назад</span>
                    <span className="hidden sm:inline">90 дней назад</span>
                  </span>
                  <span>доступность за 90 дней: {percent(component.uptime90)}</span>
                  <span>сегодня</span>
                </div>
              </div>
            )
          })}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">История за 2 недели</h2>
          {page.history.length === 0 ? (
            <p className="card p-5 text-sm text-text-muted sm:p-6">Инцидентов не было.</p>
          ) : (
            page.history.map((incident) => <IncidentCard key={incident.id} incident={incident} />)
          )}
        </section>

        <p className="text-sm text-text-muted">
          Если у вас что-то не работает, а здесь всё зелёное — напишите в{' '}
          <a href={config.brand.supportUrl} className="text-brand-400 underline decoration-dotted">
            поддержку
          </a>
          . Данные для автоматических проверок — <a href="/api/status" className="underline decoration-dotted">/api/status</a>.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}
