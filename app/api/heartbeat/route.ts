import { NextResponse, after } from 'next/server'
import { purgeOldHistory } from '@/lib/history'
import { processHeartbeat } from '@/lib/quota'
import { getClientPolicy } from '@/lib/policy'
import { clientIp } from '@/lib/rate-limit'
import { reconcileRelays } from '@/lib/relays'

export const dynamic = 'force-dynamic'

/**
 * Шлюз heartbeat. Клиент шлёт сюда каждые 15 секунд `{id, uuid, ver, conns}`.
 *
 * В ответе:
 *   - `sysinfo` — просьба прислать сведения о системе, если их ещё нет;
 *   - `disconnect` — список conn_id, которые клиент разорвёт, когда бесплатные
 *     3 часа в сутки закончились;
 *   - `strategy` — настройки клиента из админки. Клиент применяет их сам,
 *     поэтому правки доезжают до всех установленных клиентов за один
 *     интервал heartbeat и без переустановки.
 */
export async function POST(request: Request) {
  const raw = await request.text()

  let payload: Record<string, any> = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const hostId = String(payload.id ?? '')
  const conns: number[] = Array.isArray(payload.conns)
    ? payload.conns.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
    : []

  const body: Record<string, unknown> = {}
  if (!hostId) return NextResponse.json(body)

  const result = await processHeartbeat({
    hostId,
    uuid: payload.uuid ? String(payload.uuid) : undefined,
    version: payload.ver ? String(payload.ver) : undefined,
    ip: clientIp(request),
    conns,
  })

  // Журнал старше срока хранения чистим попутно, не чаще раза в шесть часов.
  after(() => purgeOldHistory().catch((error) => console.error('[history] очистка журнала:', error)))
  // Список ретрансляторов в hbbs сверяем не чаще раза в пять минут.
  after(() => reconcileRelays().catch((error) => console.error('[relays] сверка:', error)))

  if (result.disconnect.length > 0) body.disconnect = result.disconnect

  // Сведений о системе ещё нет — просим клиент прислать их (/api/sysinfo).
  if (!result.device?.sysinfoAt) body.sysinfo = true

  // Рассылка настроек клиентам: отдаём политику, пока клиент не подтвердит,
  // что уже применил именно эту версию.
  const policy = await getClientPolicy()
  if (policy.modifiedAt > 0 && Object.keys(policy.options).length > 0) {
    const clientModifiedAt = Number(payload.modified_at ?? 0)
    body.modified_at = policy.modifiedAt
    if (clientModifiedAt !== policy.modifiedAt) {
      body.strategy = { config_options: policy.options }
    }
  }

  return NextResponse.json(body, { status: 200 })
}
