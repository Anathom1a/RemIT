import { NextResponse } from 'next/server'
import { closeSession, describeSession, openSession } from '@/lib/quota'

export const dynamic = 'force-dynamic'

/**
 * Аудит подключений от управляемого клиента. Приходит в три приёма:
 *   - `action: new` с адресом, откуда подключаются;
 *   - запись без action с `peer: [id, имя]` и видом подключения (`type`) —
 *     после входа; только здесь становится известна управляющая сторона,
 *     и расход бесплатного времени переписывается на неё;
 *   - `action: close` при завершении.
 * Наша сборка клиента может прислать `peer_id` сразу в `new` — тоже учитываем.
 */
export async function POST(request: Request) {
  let payload: Record<string, any> = {}
  try {
    const raw = await request.text()
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const hostId = String(payload.id ?? '')
  const connId = Number(payload.conn_id)
  const action = String(payload.action ?? '')
  const peer = Array.isArray(payload.peer) ? payload.peer : []
  const controllerId = String(payload.peer_id ?? peer[0] ?? '').slice(0, 64)
  const controllerName = typeof peer[1] === 'string' ? peer[1].slice(0, 100) : undefined
  const ip = typeof payload.ip === 'string' ? payload.ip.slice(0, 64) : undefined
  const connType = Number.isInteger(payload.type) ? Number(payload.type) : undefined

  if (hostId && Number.isFinite(connId)) {
    if (action === 'new') {
      await openSession({ hostId, connId, controllerId, details: { ip } })
    } else if (action === 'close') {
      await closeSession(hostId, connId, 'client')
    } else {
      await describeSession({ hostId, connId, controllerId, details: { controllerName, ip, connType } })
    }
  }

  return NextResponse.json({ code: 0, message: 'success', data: '' })
}
