import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { GrantSubscription } from '@/components/admin/grant-subscription'
import { SessionLimit } from '@/components/admin/session-limit'
import { TrialGrant } from '@/components/admin/trial-grant'
import { config } from '@/lib/config'
import { getStore } from '@/lib/store'
import { getPlan } from '@/lib/plans'
import { getQuotaState, userSubject } from '@/lib/quota'
import { formatDate, humanDuration } from '@/lib/time'

export const metadata: Metadata = { title: 'Пользователи' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q : ''
  const page = Math.max(1, Number.parseInt(typeof params.p === 'string' ? params.p : '1', 10) || 1)

  const store = await getStore()
  const { users, total } = await store.listUsers({ query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })

  const rows = await Promise.all(
    users.map(async (user) => {
      const [subscription, quota, devices] = await Promise.all([
        store.getActiveSubscription(user.id),
        getQuotaState(userSubject(user.id)),
        store.listDevicesByUser(user.id),
      ])
      return { user, subscription, quota, devices: devices.length }
    }),
  )

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Пользователи</h1>
        <p className="mt-1 text-sm text-text-muted">Всего аккаунтов: {total}</p>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Поиск по почте или имени"
          className="h-10 w-full max-w-sm rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          className="h-10 rounded-xl border border-white/12 bg-ink-800/70 px-4 text-sm text-text-primary hover:border-white/25"
        >
          Найти
        </button>
      </form>

      <div className="space-y-4">
        {rows.length === 0 && (
          <p className="card p-8 text-center text-sm text-text-muted">Ничего не найдено.</p>
        )}

        {rows.map(({ user, subscription, quota, devices }) => (
          <div key={user.id} className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  {user.name}{' '}
                  {user.role === 'admin' ? (
                    <span className="pill !py-0.5 !text-[11px]">админ</span>
                  ) : (
                    config.admin.emails.includes(user.email) && (
                      <span className="pill !py-0.5 !text-[11px]">админ по .env</span>
                    )
                  )}
                </p>
                <p className="mt-1 text-sm text-text-secondary">{user.email}</p>
                <p className="mt-1 font-mono text-xs text-text-muted">{user.id}</p>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-text-muted">Тариф</dt>
                  <dd>{subscription ? getPlan(subscription.plan).name : 'Бесплатный'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Действует до</dt>
                  <dd>{subscription ? formatDate(subscription.expiresAt) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Сегодня</dt>
                  <dd className="tabular-nums">
                    {humanDuration(quota.usedSeconds)}
                    {quota.limitSeconds !== null && ` из ${humanDuration(quota.limitSeconds)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Сессий</dt>
                  <dd className="tabular-nums">
                    {quota.concurrentLimit}
                    {subscription?.concurrentSessions != null && (
                      <span className="ml-1 text-xs text-brand-400">по договору</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Устройств</dt>
                  <dd className="tabular-nums">{devices}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 space-y-3 border-t border-white/8 pt-4">
              {subscription && (
                <SessionLimit
                  userId={user.id}
                  current={subscription.concurrentSessions}
                  planDefault={getPlan(subscription.plan).concurrentSessions}
                />
              )}
              <TrialGrant
                userId={user.id}
                defaultPlan={config.trial.defaultPlan}
                defaultDays={config.trial.defaultDays}
                maxDays={config.trial.maxDays}
              />
              <div className="flex flex-wrap items-center gap-2">
              <GrantSubscription userId={user.id} />
              {subscription && (
                <ActionButton
                  endpoint="/api/v1/admin/subscriptions"
                  body={{ action: 'cancel', userId: user.id }}
                  label="Отменить подписку"
                  variant="danger"
                  confirm={`Отменить подписку ${user.email}?`}
                />
              )}
              <ActionButton
                endpoint="/api/v1/admin/usage"
                body={{ userId: user.id }}
                label="Обнулить расход за сегодня"
              />
              <ActionButton
                endpoint="/api/v1/admin/users"
                body={{ userId: user.id, role: user.role === 'admin' ? 'user' : 'admin' }}
                label={user.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                confirm={
                  user.role === 'admin'
                    ? `Снять права администратора у ${user.email}?`
                    : `Выдать права администратора ${user.email}?`
                }
              />
              </div>
            </div>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: pages }, (_, index) => index + 1).map((value) => (
            <a
              key={value}
              href={`/admin/polzovateli?${new URLSearchParams({ q: query, p: String(value) })}`}
              className={`rounded-lg px-3 py-1.5 ${
                value === page ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {value}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
