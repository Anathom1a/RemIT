import type { Metadata } from 'next'
import { ServerCommandForm } from '@/components/admin/server-command'
import { checkIdServer } from '@/lib/admin'
import { config } from '@/lib/config'
import { SERVER_COMMANDS, type ServerTarget } from '@/lib/server-cmd'

export const metadata: Metadata = { title: 'Сервер' }
export const dynamic = 'force-dynamic'

const TITLES: Record<ServerTarget, string> = {
  hbbs: 'Сервер идентификации (hbbs)',
  hbbr: 'Ретранслятор (hbbr)',
}

export default async function AdminServerPage() {
  const status = await checkIdServer()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Сервер</h1>
        <p className="mt-1 text-sm text-text-muted">
          Служебные команды hbbs и hbbr: ретрансляторы, блокировка адресов, ограничение скорости. Изменения действуют до
          перезапуска контейнера — постоянные настройки задавайте в .env. Работает со своим образом сервера (патч
          server-cmd-hook).
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${status.ok ? 'bg-success' : 'bg-danger'}`} />
          hbbs {status.ok ? 'отвечает' : 'недоступен'} · {config.rustdesk.hbbsCommand} / {config.rustdesk.hbbrCommand}
        </p>
      </div>

      {(Object.keys(SERVER_COMMANDS) as ServerTarget[]).map((target) => (
        <div key={target} className="card p-6">
          <h2 className="font-semibold">{TITLES[target]}</h2>
          <div className="mt-4">
            <ServerCommandForm
              target={target}
              presets={SERVER_COMMANDS[target].map((command) => command.alias || command.cmd)}
            />
          </div>
          <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {SERVER_COMMANDS[target].map((command) => (
              <div key={command.cmd}>
                <dt className="font-mono text-xs text-text-primary">
                  {command.cmd}
                  {command.alias && ` (${command.alias})`} {command.args}
                </dt>
                <dd className="text-text-muted">{command.explain}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
