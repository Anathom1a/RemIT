import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { DataTable } from '@/components/ui/data-table'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Устройства' }
export const dynamic = 'force-dynamic'

export default async function AdminDevicesPage() {
  const store = await getStore()
  const devices = await store.listDevices(100)

  const emails = new Map<string, string>()
  for (const id of new Set(devices.map((device) => device.userId).filter(Boolean) as string[])) {
    emails.set(id, (await store.findUserById(id))?.email ?? '—')
  }

  const bound = devices.filter((device) => device.userId).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Устройства</h1>
        <p className="mt-1 text-sm text-text-muted">
          Показаны последние {devices.length} по активности · привязано к аккаунтам: {bound}
        </p>
      </div>

      <div className="card overflow-hidden">
        <DataTable
          rows={devices}
          getKey={(device) => device.rustdeskId}
          minWidth={980}
          empty="Устройств пока нет. Они появляются, когда клиент отправляет первый heartbeat."
          columns={[
            {
              key: 'id',
              header: 'ID',
              primary: true,
              render: (device) => <span className="font-mono text-xs">{device.rustdeskId}</span>,
            },
            {
              key: 'owner',
              header: 'Владелец',
              render: (device) =>
                device.userId ? emails.get(device.userId) : <span className="text-text-muted">не привязано</span>,
            },
            {
              key: 'name',
              header: 'Имя и ОС',
              render: (device) => (
                <span>
                  {device.name || '—'}
                  {device.os ? ` · ${device.os}` : ''}
                  {(device.osUsername || device.cpu || device.memory) && (
                    <span className="block text-xs text-text-muted">
                      {[device.osUsername, device.cpu, device.memory].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: 'version',
              header: 'Клиент и адрес',
              render: (device) => (
                <span className="text-xs">
                  {device.version || '—'}
                  {device.lastIp && <span className="block text-text-muted">{device.lastIp}</span>}
                </span>
              ),
            },
            {
              key: 'seen',
              header: 'Последняя активность',
              render: (device) => formatDateTime(device.lastSeenAt),
            },
            {
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (device) =>
                device.userId ? (
                  <ActionButton
                    endpoint="/api/v1/admin/devices"
                    body={{ rustdeskId: device.rustdeskId, action: 'unbind' }}
                    label="Отвязать"
                    variant="danger"
                    confirm={`Отвязать устройство ${device.rustdeskId} от аккаунта?`}
                  />
                ) : null,
            },
          ]}
        />
      </div>
    </div>
  )
}
