import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { RelayAddForm, RelayInstallButton } from '@/components/admin/relay-forms'
import { ServerCommandForm } from '@/components/admin/server-command'
import { MAIN_RELAY_ID, hbbsRelayList, reconcileState, relayStatuses, type ProbeResult } from '@/lib/relays'
import { SERVER_COMMANDS } from '@/lib/server-cmd'
import { formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Ретрансляторы' }
export const dynamic = 'force-dynamic'

function Probe({ label, probe }: { label: string; probe: ProbeResult | null }) {
  if (!probe) return null
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={`size-2 shrink-0 rounded-full ${probe.ok ? 'bg-success' : 'bg-danger'}`} />
      <span className="text-text-secondary">{label}:</span>
      <span className="text-text-muted">{probe.detail}</span>
    </span>
  )
}

export default async function AdminRelaysPage() {
  const [relays, hbbs] = await Promise.all([
    relayStatuses(),
    hbbsRelayList().then(
      (list) => ({ ok: true as const, list }),
      (error: Error) => ({ ok: false as const, error: error.message }),
    ),
  ])
  const sync = reconcileState()
  const presets = SERVER_COMMANDS.hbbr.map((command) => command.alias || command.cmd)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ретрансляторы</h1>
        <p className="mt-1 text-sm text-text-muted">
          Когда прямое соединение не получилось, трафик идёт через ретранслятор (hbbr). Клиент его не выбирает: при
          каждом соединении адрес назначает сервер, по кругу из включённых здесь узлов, и сам пропускает те, что не
          отвечают. Добавьте узел, установите его командой ниже, дождитесь зелёных отметок и включите.
        </p>
      </div>

      <div className="card space-y-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Что раздаёт hbbs сейчас</h2>
            {hbbs.ok ? (
              <p className="mt-1 font-mono text-sm">{hbbs.list.join(', ') || '—'}</p>
            ) : (
              <p className="mt-1 text-sm text-danger">{hbbs.error}</p>
            )}
            {sync && (
              <p className="mt-1 text-xs text-text-muted">
                Сверка {formatDateTime(sync.at)}: {sync.ok ? '' : 'ошибка — '}
                {sync.detail}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton endpoint="/api/v1/admin/relays" body={{ action: 'sync' }} label="Сверить" />
            <ActionButton endpoint="/api/v1/admin/relays" body={{ action: 'apply' }} label="Передать список заново" />
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Сайт сверяет список раз в пять минут и возвращает его, если hbbs перезапускался. Узлы, которые не отвечают,
          hbbs временно исключает сам — это не ошибка.
        </p>
      </div>

      {relays.map((relay) => (
        <div key={relay.id} className="card space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                {relay.name}
                <span className={`pill !py-0.5 !text-xs ${relay.enabled ? '' : 'opacity-60'}`}>
                  {relay.enabled ? 'включён' : 'выключен'}
                </span>
              </h2>
              <p className="mt-1 font-mono text-sm text-text-secondary">{relay.address}</p>
              {relay.region && <p className="text-xs text-text-muted">{relay.region}</p>}
              <div className="mt-2 space-y-1">
                <Probe label="ретрансляция" probe={relay.tcp} />
                <Probe label="веб-клиент (TLS)" probe={relay.tls} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                endpoint="/api/v1/admin/relays"
                body={{ action: 'update', id: relay.id, enabled: !relay.enabled }}
                label={relay.enabled ? 'Выключить' : 'Включить'}
                confirm={
                  relay.enabled
                    ? `Выключить «${relay.name}»? Новые соединения пойдут через другие узлы, текущие не прервутся.`
                    : undefined
                }
              />
              {relay.id !== MAIN_RELAY_ID && (
                <ActionButton
                  endpoint="/api/v1/admin/relays"
                  body={{ action: 'remove', id: relay.id }}
                  label="Удалить"
                  variant="danger"
                  confirm={`Удалить ретранслятор «${relay.name}»?`}
                />
              )}
            </div>
          </div>

          {relay.id !== MAIN_RELAY_ID && !relay.tcp.ok && <RelayInstallButton id={relay.id} />}

          <details>
            <summary className="cursor-pointer text-sm text-text-secondary">Команды узла (нагрузка, скорость, блокировки)</summary>
            <div className="mt-3">
              <ServerCommandForm target="hbbr" presets={presets} relayId={relay.id} initial="usage" />
            </div>
          </details>
        </div>
      ))}

      <div className="card space-y-3 p-6">
        <h2 className="font-semibold">Добавить ретранслятор</h2>
        <p className="text-sm text-text-muted">
          Нужна машина с белым адресом и доменное имя, указывающее на неё: веб-клиенту нужен сертификат. Открытые
          порты: 21117 (ретрансляция), 21119 (веб-клиент), 80 и 443 (выпуск сертификата). Новый узел добавляется
          выключенным.
        </p>
        <RelayAddForm />
      </div>
    </div>
  )
}
