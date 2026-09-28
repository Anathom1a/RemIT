import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ActionButton } from '@/components/admin/action-button'
import { DeviceForm } from '@/components/cabinet/device-form'
import { UnbindButton } from '@/components/cabinet/unbind-button'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Устройства' }
export const dynamic = 'force-dynamic'

export default async function DevicesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const store = await getStore()
  const [devices, tokens] = await Promise.all([
    store.listDevicesByUser(user.id),
    store.listClientTokens({ userId: user.id, limit: 100 }),
  ])
  const now = new Date().toISOString()
  const logins = tokens.filter((token) => !token.revokedAt && token.expiresAt > now)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Устройства</h1>
        <p className="mt-1 text-sm text-text-muted">
          Привязанные устройства расходуют лимит и подписку аккаунта. Непривязанные работают по правилам
          бесплатного тарифа отдельно от вашего аккаунта.
        </p>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold">Вход в клиенте</h2>
        <p className="mt-1.5 text-sm text-text-secondary">
          В клиенте {config.brand.name} нажмите «Войти» и введите почту <span className="text-text-primary">{user.email}</span>{' '}
          и пароль от личного кабинета. Компьютер, с которого вы вошли, сам появится в списке ниже, а{' '}
          <a href="/kabinet/adresnaya-kniga" className="text-brand-400 hover:text-brand-300">
            адресная книга
          </a>{' '}
          будет общей на всех ваших устройствах.
        </p>
      </div>

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
                  {(device.osUsername || device.cpu || device.memory || device.version) && (
                    <p className="mt-1 text-xs text-text-muted">
                      {[
                        device.osUsername && `пользователь ${device.osUsername}`,
                        device.cpu,
                        device.memory && `память ${device.memory}`,
                        device.version && `клиент ${device.version}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <UnbindButton rustdeskId={device.rustdeskId} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-6 py-4">
          <h2 className="flex-1 font-semibold">Где выполнен вход в клиенте · {logins.length}</h2>
          {logins.length > 1 && (
            <ActionButton
              endpoint="/api/v1/client-sessions"
              body={{ action: 'revoke-all' }}
              label="Выйти везде"
              variant="danger"
              confirm="Выйти из клиента на всех устройствах?"
            />
          )}
        </div>
        {logins.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-text-muted">Вы не вошли в клиенте ни на одном устройстве.</p>
        ) : (
          <ul className="divide-y divide-white/8">
            {logins.map((login) => (
              <li key={login.tokenHash} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">
                    {login.deviceName || 'устройство'}
                    {login.deviceId && <span className="ml-2 font-mono text-xs text-text-muted">{login.deviceId}</span>}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {[login.os, login.ip !== 'unknown' && login.ip].filter(Boolean).join(' · ')}
                    {login.os || login.ip ? ' · ' : ''}
                    вход {formatDateTime(login.createdAt)} · активность {formatDateTime(login.lastUsedAt)}
                  </p>
                </div>
                <ActionButton
                  endpoint="/api/v1/client-sessions"
                  body={{ action: 'revoke', token: login.tokenHash }}
                  label="Выйти"
                  variant="danger"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
