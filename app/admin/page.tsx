import type { Metadata } from 'next'
import Link from 'next/link'
import { checkRustdeskApi, getAdminOverview } from '@/lib/admin'
import { getRuntimeSettings } from '@/lib/settings'
import { formatPrice } from '@/lib/plans'
import { humanDuration } from '@/lib/time'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Админка' }
export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const settings = await getRuntimeSettings()
  const [overview, api] = await Promise.all([getAdminOverview(settings.freeSecondsPerDay), checkRustdeskApi()])

  const metrics = [
    { label: 'Пользователей', value: overview.users.toString(), hint: 'всего аккаунтов' },
    { label: 'Активных подписок', value: overview.activeSubscriptions.toString(), hint: 'не истекли' },
    { label: 'Выручка в месяц', value: formatPrice(overview.monthlyRevenue), hint: 'сумма активных тарифов' },
    { label: 'Оплачено за 30 дней', value: formatPrice(overview.paidLast30Days), hint: 'подтверждённые платежи' },
    { label: 'Сессий сейчас', value: overview.activeSessions.toString(), hint: 'идут прямо сейчас' },
    { label: 'Устройств', value: overview.devices.toString(), hint: 'видел сервер' },
    { label: 'Время за сегодня', value: humanDuration(overview.usageTodaySeconds), hint: `${overview.usageTodaySubjects} плательщиков` },
    { label: 'Бесплатный лимит', value: humanDuration(settings.freeSecondsPerDay), hint: 'в сутки на аккаунт' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Обзор</h1>
        <p className="mt-1 text-sm text-text-muted">
          Состояние сервиса на {new Date().toLocaleString('ru-RU', { timeZone: config.quota.timeZone })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="card p-5">
            <p className="text-sm text-text-muted">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{metric.value}</p>
            <p className="mt-1 text-xs text-text-muted">{metric.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-semibold">Панель rustdesk-api</h2>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <span className={`size-2 rounded-full ${api.ok ? 'bg-success' : 'bg-danger'}`} />
            <span className={api.ok ? 'text-success' : 'text-danger'}>
              {api.ok ? 'отвечает' : 'недоступна'}
            </span>
            <span className="text-text-muted">
              {config.rustdesk.upstream} · HTTP {api.status || '—'}
            </span>
          </p>
          <p className="mt-2 break-all text-xs text-text-muted">{api.detail}</p>
          <p className="mt-4 text-sm text-text-secondary">
            Через эту панель проходят вход клиентов и адресная книга. Шлюз учёта времени работает
            независимо: если панель недоступна, время всё равно считается.
          </p>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold">Конфигурация</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            {[
              { term: 'Приём оплаты', value: config.billing.provider === 'yookassa' ? 'ЮKassa' : 'вручную по счёту' },
              { term: 'Ключи ЮKassa', value: config.billing.yookassa.shopId ? 'заданы' : 'не заданы' },
              { term: 'ID-сервер', value: config.rustdesk.idServer },
              { term: 'Часовой пояс тарификации', value: config.quota.timeZone },
              { term: 'Регистрация', value: settings.registrationEnabled ? 'открыта' : 'закрыта' },
            ].map((row) => (
              <div key={row.term} className="flex justify-between gap-4">
                <dt className="text-text-muted">{row.term}</dt>
                <dd className="text-right text-text-primary">{row.value}</dd>
              </div>
            ))}
          </dl>
          <Link href="/admin/nastroyki" className="mt-4 inline-block text-sm text-brand-400 underline decoration-dotted">
            Изменить настройки →
          </Link>
        </div>
      </div>

      {settings.maintenanceMessage && (
        <div className="card border-warning/30 p-5">
          <h2 className="font-semibold text-warning">Сообщение показывается пользователям</h2>
          <p className="mt-2 text-sm text-text-secondary">{settings.maintenanceMessage}</p>
        </div>
      )}
    </div>
  )
}
