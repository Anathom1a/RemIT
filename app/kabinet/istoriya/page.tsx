import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DataTable } from '@/components/ui/data-table'
import { getCurrentUser } from '@/lib/auth'
import { getHistory, type HistoryRow } from '@/lib/history'
import { getStore } from '@/lib/store'
import type { FileAudit } from '@/lib/types'
import { PLANS, connectionsWord } from '@/lib/plans'
import { formatDateTime, humanDuration } from '@/lib/time'

export const metadata: Metadata = { title: 'История подключений' }
export const dynamic = 'force-dynamic'

/** Сколько строк показываем на странице; полный список — в выгрузке. */
const PAGE_ROWS = 300

export default async function HistoryPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const history = await getHistory(user)
  const store = await getStore()
  const devices = await store.listDevicesByUser(user.id)
  const names = new Map(devices.map((device) => [device.rustdeskId, device.name]))
  const files = devices.length
    ? (await store.listFileAudits({ hostIds: devices.map((device) => device.rustdeskId), limit: 200 })).filter(
        (audit) => audit.createdAt >= history.since,
      )
    : []
  const shown = history.rows.slice(0, PAGE_ROWS)
  // Тариф с более длинной историей — подсказка для тех, кому не хватает.
  const longer = PLANS.find((plan) => !plan.negotiable && plan.historyDays > history.days && plan.priceMonthly > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">История подключений</h1>
          <p className="mt-1 text-sm text-text-muted">
            За последние {history.days} дн. на тарифе «{history.plan.name}» · {history.rows.length}{' '}
            {history.truncated ? '(показаны последние) ' : ''}
            {connectionsWord(history.rows.length)}, всего {humanDuration(history.totalSeconds)}
          </p>
        </div>
        <a
          href="/api/v1/history/export"
          download
          className="rounded-xl border border-white/12 bg-ink-800/70 px-4 py-2 text-sm text-text-primary hover:border-white/25"
        >
          Скачать для Excel
        </a>
      </div>

      {longer && (
        <p className="text-sm text-text-secondary">
          Нужна история глубже? На тарифе «{longer.name}» — {longer.historyDays} дней.{' '}
          <Link href="/kabinet/podpiska" className="text-brand-400 underline decoration-dotted">
            Сменить тариф
          </Link>
        </p>
      )}

      <div className="card overflow-hidden">
        <DataTable<HistoryRow>
          rows={shown}
          getKey={(row) => row.key}
          minWidth={820}
          empty="Подключений за этот период не было. Привяжите свои компьютеры в разделе «Устройства» — тогда здесь будут видны и подключения к ним."
          columns={[
            { key: 'start', header: 'Начало', primary: true, render: (row) => formatDateTime(row.startedAt) },
            {
              key: 'duration',
              header: 'Длительность',
              render: (row) => <span className="tabular-nums">{humanDuration(row.seconds)}</span>,
            },
            {
              key: 'direction',
              header: 'Направление',
              render: (row) => (row.direction === 'outgoing' ? 'вы подключались' : 'к вашему устройству'),
            },
            {
              key: 'host',
              header: 'Устройство',
              render: (row) => (
                <span>
                  {row.hostName && <span className="text-text-primary">{row.hostName} · </span>}
                  <span className="font-mono text-xs">{row.hostId}</span>
                </span>
              ),
            },
            {
              key: 'controller',
              header: 'Кто подключался',
              render: (row) => (
                <span>
                  {row.controllerName && <span className="text-text-primary">{row.controllerName} · </span>}
                  <span className="font-mono text-xs">{row.controllerId || '—'}</span>
                  {row.ip && <span className="block text-xs text-text-muted">{row.ip}</span>}
                </span>
              ),
            },
            { key: 'status', header: 'Как завершилась', render: (row) => row.status },
          ]}
        />
        {history.rows.length > PAGE_ROWS && (
          <p className="border-t border-white/8 px-6 py-3 text-xs text-text-muted">
            На странице — последние {PAGE_ROWS}. Полный список за период — в файле для Excel.
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Передача файлов · {files.length}</h2>
          <p className="mt-1 text-xs text-text-muted">Файлы, которые передавали с ваших устройств и на них.</p>
        </div>
        <DataTable<FileAudit>
          rows={files}
          getKey={(audit) => audit.id}
          minWidth={820}
          empty="За этот период файлы не передавали."
          columns={[
            { key: 'at', header: 'Когда', primary: true, render: (audit) => formatDateTime(audit.createdAt) },
            {
              key: 'direction',
              header: 'Направление',
              render: (audit) => (audit.type === 0 ? 'с устройства' : 'на устройство'),
            },
            {
              key: 'host',
              header: 'Устройство',
              render: (audit) => (
                <span>
                  {names.get(audit.hostId) && <span className="text-text-primary">{names.get(audit.hostId)} · </span>}
                  <span className="font-mono text-xs">{audit.hostId}</span>
                </span>
              ),
            },
            {
              key: 'who',
              header: 'Кто',
              render: (audit) => (
                <span>
                  {audit.controllerName && <span className="text-text-primary">{audit.controllerName} · </span>}
                  <span className="font-mono text-xs">{audit.controllerId || '—'}</span>
                </span>
              ),
            },
            {
              key: 'files',
              header: 'Что',
              render: (audit) => (
                <span className="break-all text-xs">
                  {audit.path}
                  {audit.num > 0 && <span className="text-text-muted"> · файлов: {audit.num}</span>}
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
