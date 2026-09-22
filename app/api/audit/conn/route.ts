import { NextResponse } from 'next/server'
import { closeSession, openSession } from '@/lib/quota'
import { proxyToRustdeskApi } from '@/lib/upstream'

export const dynamic = 'force-dynamic'

/**
 * Шлюз аудита подключений. Клиент присылает сюда `action: new` при входящем
 * подключении и `action: close` при его завершении. Из `peer_id` мы узнаём
 * управляющую сторону — именно ей записывается расход бесплатного времени.
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
  const connId = Number(payload.conn_id)
  const action = String(payload.action ?? '')
  const controllerId = String(payload.peer_id ?? '')

  if (hostId && Number.isFinite(connId)) {
    if (action === 'new') {
      await openSession({ hostId, connId, controllerId })
    } else if (action === 'close') {
      await closeSession(hostId, connId, 'client')
    }
  }

  const upstream = await proxyToRustdeskApi('/api/audit/conn', request, raw)
  return NextResponse.json(upstream.json ?? {}, { status: upstream.status === 502 ? 200 : upstream.status })
}
