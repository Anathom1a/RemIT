import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { PurgeForm } from '@/components/admin/purge-form'
import { DataTable } from '@/components/ui/data-table'
import { alarmDetails, alarmName } from '@/lib/alarms'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import type { ClientAlarm } from '@/lib/types'

export const metadata: Metadata = { title: 'Тревоги' }
export const dynamic = 'force-dynamic'

export default async function AdminAlarmsPage() {
  const store = await getStore()
  const alarms = await store.listAlarms({ limit: 300 })
  const owners = new Map<string, string>()
  for (const hostId of new Set(alarms.map((alarm) => alarm.hostId))) {
    const device = await store.findDeviceByRustdeskId(hostId)
    const owner = device?.userId ? await store.findUserById(device.userId) : null
    owners.set(hostId, owner?.email ?? '')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Тревоги</h1>
          <p className="mt-1 text-sm text-text-muted">
            Последние {alarms.length}: подбор пароля, подключения с адресов вне белого списка и другие события
            безопасности из клиентов.
          </p>
        </div>
        <PurgeForm kind="alarm" />
      </div>

      <div className="card overflow-hidden">
        <DataTable<ClientAlarm>
          rows={alarms}
          getKey={(alarm) => alarm.id}
          minWidth={900}
          empty="Тревог не было."
          columns={[
            { key: 'at', header: 'Когда', primary: true, render: (alarm) => formatDateTime(alarm.createdAt) },
            { key: 'type', header: 'Что', render: (alarm) => alarmName(alarm.type) },
            {
              key: 'host',
              header: 'Устройство',
              render: (alarm) => (
                <span>
                  <span className="font-mono text-xs">{alarm.hostId}</span>
                  {owners.get(alarm.hostId) && <span className="block text-xs text-text-muted">{owners.get(alarm.hostId)}</span>}
                </span>
              ),
            },
            {
              key: 'who',
              header: 'Откуда',
              render: (alarm) => {
                const details = alarmDetails(alarm.info)
                return (
                  <span className="text-xs">
                    {alarm.ip || details.ip || '—'}
                    {(details.name || details.id) && (
                      <span className="block text-text-muted">{[details.name, details.id].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                )
              },
            },
            {
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (alarm) => (
                <ActionButton endpoint="/api/v1/admin/logs" body={{ action: 'delete', kind: 'alarm', id: alarm.id }} label="Удалить" variant="danger" />
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
