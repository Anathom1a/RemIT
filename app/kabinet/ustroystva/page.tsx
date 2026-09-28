import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ClientLinkForm } from '@/components/cabinet/client-link-form'
import { DeviceForm } from '@/components/cabinet/device-form'
import { UnbindButton } from '@/components/cabinet/unbind-button'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'
import { panelLinkEnabled } from '@/lib/panel'

export const metadata: Metadata = { title: 'Устройства' }
export const dynamic = 'force-dynamic'

export default async function DevicesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const store = await getStore()
  const [devices, clientAccount] = await Promise.all([
    store.listDevicesByUser(user.id),
    store.findPanelAccount(user.id),
  ])
  const unified = panelLinkEnabled()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Устройства</h1>
        <p className="mt-1 text-sm text-text-muted">
          Привязанные устройства расходуют лимит и подписку аккаунта. Непривязанные работают по правилам
          бесплатного тарифа отдельно от вашего аккаунта.
        </p>
      </div>

      {unified && (
        <div className="card p-6">
          <h2 className="font-semibold">Вход в клиенте</h2>
          <p className="mt-1.5 text-sm text-text-secondary">
            В клиенте {config.brand.name} нажмите «Войти» и введите почту <span className="text-text-primary">{user.email}</span>{' '}
            и пароль от личного кабинета. Компьютер, с которого вы вошли, сам появится в списке ниже, а адресная
            книга будет общей на всех ваших устройствах.
          </p>
          <p className="mt-3 text-sm text-text-muted">
            {clientAccount
              ? clientAccount.origin === 'linked'
                ? `Прежний аккаунт клиента «${clientAccount.panelUsername}» перенесён в этот аккаунт.`
                : 'Вы уже входили в клиенте с этим аккаунтом.'
              : 'Вы ещё не входили в клиенте с этим аккаунтом.'}
          </p>
          <details className="group mt-4 rounded-xl border border-white/8 px-4 py-3">
            <summary className="cursor-pointer text-sm text-text-secondary hover:text-text-primary">
              Пользовались клиентом с отдельным логином до регистрации на сайте?
            </summary>
            <p className="mt-3 mb-4 text-sm text-text-secondary">
              Введите прежние логин и пароль — перенесём аккаунт вместе с адресной книгой. После переноса в
              клиенте входите почтой и паролем от кабинета, прежний пароль перестанет действовать.
            </p>
            <ClientLinkForm />
          </details>
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-semibold">Привязать устройство</h2>
        <p className="mt-1.5 mb-4 text-sm text-text-secondary">
          Откройте клиент {config.brand.name} на нужном компьютере и введите здесь ID, который он показывает.
        </p>
        <DeviceForm />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Мои устройства</h2>
        </div>
        {devices.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-text-muted">Пока ни одного устройства.</p>
        ) : (
          <ul className="divide-y divide-white/8">
            {devices.map((device) => (
              <li key={device.rustdeskId} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-text-primary">{device.rustdeskId}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {device.name || 'без имени'}
                    {device.os ? ` · ${device.os}` : ''} · последняя активность {formatDateTime(device.lastSeenAt)}
                  </p>
                </div>
                <UnbindButton rustdeskId={device.rustdeskId} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
