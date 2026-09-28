import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { PurgeForm } from '@/components/admin/purge-form'
import { DataTable } from '@/components/ui/data-table'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import type { FileAudit } from '@/lib/types'

export const metadata: Metadata = { title: 'Передача файлов' }
export const dynamic = 'force-dynamic'

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${bytes} Б`
}

export default async function AdminFileAuditPage() {
  const store = await getStore()
  const audits = await store.listFileAudits({ limit: 300 })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Передача файлов</h1>
          <p className="mt-1 text-sm text-text-muted">
            Последние {audits.length} операций из журнала клиентов. Журнал хранится год.
          </p>
        </div>
        <PurgeForm kind="file" />
      </div>

      <div className="card overflow-hidden">
        <DataTable<FileAudit>
          rows={audits}
          getKey={(audit) => audit.id}
          minWidth={980}
          empty="Файлы ещё не передавали."
          columns={[
            { key: 'at', header: 'Когда', primary: true, render: (audit) => formatDateTime(audit.createdAt) },
            {
              key: 'direction',
              header: 'Направление',
              render: (audit) => (audit.type === 0 ? 'с устройства' : 'на устройство'),
            },
            { key: 'host', header: 'Устройство', render: (audit) => <span className="font-mono text-xs">{audit.hostId}</span> },
            {
              key: 'who',
              header: 'Кто',
              render: (audit) => (
                <span>
                  {audit.controllerName && <span>{audit.controllerName} · </span>}
                  <span className="font-mono text-xs">{audit.controllerId || '—'}</span>
                  {audit.ip && <span className="block text-xs text-text-muted">{audit.ip}</span>}
                </span>
              ),
            },
            {
              key: 'what',
              header: 'Что',
              render: (audit) => (
                <span className="block max-w-md break-all text-xs">
                  {audit.path}
                  {audit.files.length > 0 && (
                    <span className="mt-1 block text-text-muted">
                      {audit.files
                        .slice(0, 3)
                        .map(([name, size]) => `${name || 'файл'} (${formatSize(size)})`)
                        .join(', ')}
                      {audit.num > 3 ? ` и ещё ${audit.num - 3}` : ''}
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (audit) => (
                <ActionButton endpoint="/api/v1/admin/logs" body={{ action: 'delete', kind: 'file', id: audit.id }} label="Удалить" variant="danger" />
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
