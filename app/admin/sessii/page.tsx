import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { DataTable } from '@/components/ui/data-table'
import { closeStaleSessions } from '@/lib/quota'
import { getStore } from '@/lib/store'
import { formatDateTime, humanDuration } from '@/lib/time'

export const metadata: Metadata = { title: 'Сессии' }
export const dynamic = 'force-dynamic'

export default async function AdminSessionsPage() {
  // Сессии без heartbeat закрываем, чтобы список показывал реальную картину.
  await closeStaleSessions()

  const store = await getStore()
  const active = await store.listActiveConnSessions({})

  const emails = new Map<string, string>()
  for (const id of new Set(active.map((session) => session.userId).filter(Boolean) as string[])) {
    emails.set(id, (await store.findUserById(id))?.email ?? '—')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Сессии</h1>
        <p className="mt-1 text-sm text-text-muted">
          Идут прямо сейчас: {active.length}. Завершение применяется на ближайшем heartbeat — до 15 секунд.
        </p>
      </div>

      <div className="card overflow-hidden">
        <DataTable
          rows={active}
          getKey={(session) => session.key}
          minWidth={900}
          empty="Активных сессий нет."
          columns={[
            {
              key: 'started',
              header: 'Начало',
              primary: true,
              render: (session) => formatDateTime(session.startedAt),
            },
            {
              key: 'payer',
              header: 'Плательщик',
              render: (session) => (session.userId ? emails.get(session.userId) : session.subjectKey),
            },
            {
              key: 'controller',
              header: 'Управляющий',
              render: (session) => <span className="font-mono text-xs">{session.controllerId || '—'}</span>,
            },
            {
              key: 'host',
              header: 'Управляемое',
              render: (session) => <span className="font-mono text-xs">{session.hostId}</span>,
            },
            {
              key: 'duration',
              header: 'Длительность',
              render: (session) => <span className="tabular-nums">{humanDuration(session.seconds)}</span>,
            },
            {
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (session) => (
                <ActionButton
                  endpoint="/api/v1/admin/sessions"
                  body={{ hostId: session.hostId, connId: session.connId }}
                  label="Завершить"
                  variant="danger"
                  confirm="Завершить сессию принудительно?"
                />
              ),
            },
          ]}
        />
      </div>

      <p className="text-xs text-text-muted">
        История завершённых сессий видна в кабинете пользователя и в таблице conn_sessions.
      </p>
    </div>
  )
}
