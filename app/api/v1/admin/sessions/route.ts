import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { closeSession, closeStaleSessions } from '@/lib/quota'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Сессии, которые идут прямо сейчас. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  await closeStaleSessions()
  const store = await getStore()
  const sessions = await store.listActiveConnSessions({})
  const rows = await Promise.all(
    sessions.map(async (session) => ({
      ...session,
      email: session.userId ? ((await store.findUserById(session.userId))?.email ?? null) : null,
    })),
  )
  return NextResponse.json({ sessions: rows })
}

/**
 * Принудительное завершение сессии. Запись закрывается сразу, а сам разрыв
 * произойдёт на ближайшем heartbeat — так же, как при исчерпании лимита.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const hostId = String(payload.hostId ?? '')
  const connId = Number(payload.connId)
  if (!hostId || !Number.isFinite(connId)) {
    return NextResponse.json({ error: 'Нужны hostId и connId' }, { status: 400 })
  }

  await closeSession(hostId, connId, 'admin')
  return NextResponse.json({ ok: true })
}
