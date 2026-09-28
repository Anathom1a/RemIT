import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DataTable } from '@/components/ui/data-table'
import { getCurrentUser } from '@/lib/auth'
import { getHistory, type HistoryRow } from '@/lib/history'
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
              render: (row) => <span className="font-mono text-xs">{row.controllerId || '—'}</span>,
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
    </div>
  )
}
