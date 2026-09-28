import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ActionButton } from '@/components/admin/action-button'
import { JsonForm, inputClass } from '@/components/cabinet/json-form'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'
import { formatDate } from '@/lib/time'
import { VK_PROVIDER, vkEnabled } from '@/lib/vk'

export const metadata: Metadata = { title: 'Профиль' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ vk?: string; vk_error?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const params = await searchParams
  const store = await getStore()
  const vk = (await store.listOAuthIdentities(user.id)).find((identity) => identity.provider === VK_PROVIDER)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Профиль</h1>
        <p className="mt-1 text-sm text-text-muted">Аккаунт с {formatDate(user.createdAt)}</p>
      </div>

      <div className="card p-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-text-muted">Почта</dt>
            <dd className="mt-0.5">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Имя</dt>
            <dd className="mt-0.5">{user.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Пароль</dt>
            <dd className="mt-0.5">
              {user.passwordHash ? 'задан' : 'не задан — вход через VK ID'} ·{' '}
              <a href="/vosstanovlenie" className="text-brand-400 hover:text-brand-300">
                {user.passwordHash ? 'сменить' : 'задать'}
              </a>
            </dd>
          </div>
        </dl>
      </div>

      {(vkEnabled() || vk) && (
        <div className="card p-6">
          <h2 className="font-semibold">VK ID</h2>
          {params.vk === 'linked' && <p className="mt-2 text-sm text-success">VK ID привязан.</p>}
          {params.vk_error && <p className="mt-2 text-sm text-danger">{params.vk_error}</p>}
          {vk ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-text-secondary">
                Привязан профиль {vk.name || `id${vk.subject}`}: входите на сайте и в клиенте кнопкой «VK ID».
              </p>
              <ActionButton
                endpoint="/api/v1/auth/vk/unlink"
                label="Отвязать"
                variant="danger"
                confirm="Отвязать VK ID? Входить придётся почтой и паролем."
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-text-secondary">
                Привяжите VK ID, чтобы входить на сайте и в клиенте без пароля.
              </p>
              <a
                href="/api/v1/auth/vk/start?action=link"
                className="inline-flex h-9 items-center rounded-xl bg-[#0077ff] px-3.5 text-sm font-medium text-white hover:bg-[#1a86ff]"
              >
                Привязать VK ID
              </a>
            </div>
          )}
        </div>
      )}

      <div className="card border-danger/25 p-6">
        <h2 className="font-semibold">Удалить аккаунт</h2>
        <p className="mt-1.5 mb-4 text-sm text-text-secondary">
          Почта, имя, адресные книги, команда и привязки устройств будут стёрты безвозвратно. Действующая подписка не
          возвращается. Записи об оплатах мы храним, как требует закон о бухгалтерском учёте.
        </p>
        <JsonForm
          endpoint="/api/v1/account/delete"
          body={{}}
          submitLabel="Удалить аккаунт навсегда"
          pendingLabel="Удаляем…"
          className="flex flex-wrap items-center gap-2"
        >
          {user.passwordHash ? (
            <input name="password" type="password" required autoComplete="current-password" placeholder="Пароль" className={`${inputClass} w-64`} />
          ) : (
            <input name="email" type="email" required placeholder="Почта аккаунта" className={`${inputClass} w-64`} />
          )}
        </JsonForm>
      </div>
    </div>
  )
}
