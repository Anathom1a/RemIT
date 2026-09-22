import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
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
  const devices = await store.listDevicesByUser(user.id)

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
