import { NextResponse } from 'next/server'
import { processHeartbeat } from '@/lib/quota'
import { getClientPolicy } from '@/lib/policy'
import { proxyToRustdeskApi } from '@/lib/upstream'

export const dynamic = 'force-dynamic'

/**
 * Шлюз heartbeat. Клиент шлёт сюда каждые 15 секунд `{id, uuid, ver, conns}`.
 *
 * Мы делаем в ответе две вещи:
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

  const upstream = await proxyToRustdeskApi('/api/heartbeat', request, raw)
  const body: Record<string, unknown> = upstream.json ?? {}

  if (!hostId) {
    return NextResponse.json(body, { status: upstream.status === 502 ? 200 : upstream.status })
  }

  const result = await processHeartbeat({
    hostId,
    uuid: payload.uuid ? String(payload.uuid) : undefined,
    version: payload.ver ? String(payload.ver) : undefined,
    conns,
  })

  if (result.disconnect.length > 0) {
    const fromUpstream = Array.isArray(body.disconnect) ? (body.disconnect as number[]) : []
    body.disconnect = [...new Set([...fromUpstream, ...result.disconnect])]
  }

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
