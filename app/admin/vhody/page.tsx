import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { PurgeForm } from '@/components/admin/purge-form'
import { DataTable } from '@/components/ui/data-table'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import type { ClientToken } from '@/lib/types'

export const metadata: Metadata = { title: 'Входы в клиенте' }
export const dynamic = 'force-dynamic'

function status(token: ClientToken, now: string): { label: string; active: boolean } {
  if (token.revokedAt) return { label: `выход ${formatDateTime(token.revokedAt)}`, active: false }
  if (token.expiresAt <= now) return { label: 'истёк', active: false }
  return { label: `действует до ${formatDateTime(token.expiresAt)}`, active: true }
}

export default async function AdminClientLoginsPage() {
  const store = await getStore()
  const tokens = await store.listClientTokens({ limit: 300 })
  const now = new Date().toISOString()

  const emails = new Map<string, string>()
  for (const id of new Set(tokens.map((token) => token.userId))) {
    emails.set(id, (await store.findUserById(id))?.email ?? '—')
  }
  const active = tokens.filter((token) => status(token, now).active).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Входы в клиенте</h1>
          <p className="mt-1 text-sm text-text-muted">
            Последние {tokens.length} входов в клиенте · действуют сейчас: {active}
          </p>
        </div>
        <PurgeForm kind="login" note="действующие входы не удаляются" />
      </div>

      <div className="card overflow-hidden">
        <DataTable<ClientToken>
          rows={tokens}
          getKey={(token) => token.tokenHash}
          minWidth={980}
          empty="В клиенте ещё никто не входил."
          columns={[
            { key: 'at', header: 'Вход', primary: true, render: (token) => formatDateTime(token.createdAt) },
            { key: 'user', header: 'Аккаунт', render: (token) => emails.get(token.userId) },
            {
              key: 'device',
              header: 'Устройство',
              render: (token) => (
                <span>
                  {token.deviceName || '—'}
                  {token.deviceId && <span className="ml-1.5 font-mono text-xs text-text-muted">{token.deviceId}</span>}
                  {token.os && <span className="block text-xs text-text-muted">{token.os}</span>}
                </span>
              ),
            },
            { key: 'ip', header: 'Адрес', render: (token) => <span className="text-xs">{token.ip}</span> },
            { key: 'last', header: 'Активность', render: (token) => formatDateTime(token.lastUsedAt) },
            {
              key: 'status',
              header: 'Статус',
              render: (token) => {
                const state = status(token, now)
                return <span className={state.active ? 'text-success' : 'text-text-muted'}>{state.label}</span>
              },
            },
            {
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (token) =>
                status(token, now).active ? (
                  <ActionButton
                    endpoint="/api/v1/admin/users"
                    body={{ action: 'revoke-client', token: token.tokenHash }}
                    label="Завершить"
                    variant="danger"
                    confirm="Завершить этот вход? Клиент попросит войти заново."
                  />
                ) : (
                  <ActionButton
                    endpoint="/api/v1/admin/logs"
                    body={{ action: 'delete', kind: 'login', id: token.tokenHash }}
                    label="Удалить запись"
                    variant="danger"
                  />
                ),
            },
          ]}
        />
      </div>
    </div>
  )
}
