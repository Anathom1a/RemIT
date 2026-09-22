import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { QuotaRing } from '@/components/ui/quota-ring'
import { DataTable } from '@/components/ui/data-table'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/auth'
import { getQuotaState, userSubject } from '@/lib/quota'
import { getStore } from '@/lib/store'
import { formatDate, formatDateTime, humanDuration } from '@/lib/time'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Кабинет' }
export const dynamic = 'force-dynamic'

export default async function CabinetPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const store = await getStore()
  const [state, subscription, devices] = await Promise.all([
    getQuotaState(userSubject(user.id)),
    store.getActiveSubscription(user.id),
    store.listDevicesByUser(user.id),
  ])
  const sessions = await store.listRecentConnSessions(
    [`user:${user.id}`, ...devices.map((device) => `device:${device.rustdeskId}`)],
    10,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Здравствуйте, {user.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Тариф «{state.planName}» · обнуление лимита {formatDateTime(state.resetAt)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="card flex flex-col items-center p-8">
          <QuotaRing usedSeconds={state.usedSeconds} limitSeconds={state.limitSeconds} />
          <p className="mt-6 text-center text-sm text-text-secondary">
            {state.limitSeconds === null
              ? 'Ограничение по времени снято подпиской'
              : `Использовано ${humanDuration(state.usedSeconds)} из ${humanDuration(state.limitSeconds)}`}
          </p>
          {state.exhausted && (
            <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
              Лимит исчерпан. Новые подключения будут доступны после {formatDateTime(state.resetAt)} или сразу
              после оформления подписки.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Подписка</h2>
                {subscription ? (
                  <p className="mt-1.5 text-sm text-text-secondary">
                    {subscription.provider === 'trial' ? 'Пробный период' : 'Тариф'} «{state.planName}»
                    {subscription.provider === 'trial' ? ' действует до ' : ' активен до '}
                    {formatDate(subscription.expiresAt)}
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-text-secondary">
                    Вы на бесплатном тарифе: {humanDuration(config.quota.freeSecondsPerDay)} управления в сутки.
                  </p>
                )}
              </div>
              <ButtonLink
                href="/kabinet/podpiska"
                variant={subscription && subscription.provider !== 'trial' ? 'secondary' : 'primary'}
                size="sm"
              >
                {subscription ? (subscription.provider === 'trial' ? 'Оформить подписку' : 'Продлить') : 'Снять лимит'}
              </ButtonLink>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="card p-6">
              <p className="text-sm text-text-muted">Одновременные сессии</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {state.activeSessions} / {state.concurrentLimit}
              </p>
            </div>
            <div className="card p-6">
              <p className="text-sm text-text-muted">Устройства</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{devices.length}</p>
              <Link href="/kabinet/ustroystva" className="mt-2 inline-block text-sm text-brand-400 underline decoration-dotted">
                Управлять
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Последние подключения</h2>
        </div>
        <DataTable
          rows={sessions}
          getKey={(session) => session.key}
          minWidth={640}
          empty={`Пока нет подключений. Запустите клиент ${config.brand.name} и привяжите устройство в разделе «Устройства».`}
          columns={[
            {
              key: 'started',
              header: 'Начало',
              primary: true,
              render: (session) => formatDateTime(session.startedAt),
            },
            {
              key: 'controller',
              header: 'Управляющий',
              render: (session) => <span className="font-mono text-xs">{session.controllerId || '—'}</span>,
            },
            {
              key: 'host',
              header: 'Устройство',
              render: (session) => <span className="font-mono text-xs">{session.hostId}</span>,
            },
            {
              key: 'duration',
              header: 'Длительность',
              render: (session) => <span className="tabular-nums">{humanDuration(session.seconds)}</span>,
            },
            {
              key: 'status',
              header: 'Статус',
              render: (session) =>
                session.endedAt ? (
                  <span className="text-text-muted">
                    {session.closeReason === 'quota'
                      ? 'прервана по лимиту'
                      : session.closeReason === 'admin'
                        ? 'прервана администратором'
                        : 'завершена'}
                  </span>
                ) : (
                  <span className="text-success">идёт сейчас</span>
                ),
            },
          ]}
        />
      </div>
    </div>
  )
}
