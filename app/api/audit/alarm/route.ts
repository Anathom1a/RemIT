import { NextResponse } from 'next/server'
import { alarmDetails } from '@/lib/alarms'
import { newId } from '@/lib/auth'
import { readJson } from '@/lib/client-api'
import { clientIp, consumeLimit } from '@/lib/rate-limit'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Тревоги от управляемого клиента: подключение с адреса вне белого списка,
 * подбор пароля и т. п. Видны владельцу устройства в «Истории» и в админке.
 */
export async function POST(request: Request) {
  if (!consumeLimit(`audit-alarm:${clientIp(request)}`, 300, 60_000).allowed) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 })
  }
  const payload = await readJson<Record<string, unknown>>(request)
  const hostId = String(payload?.id ?? '').slice(0, 64)
  if (!payload || !hostId) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const info = typeof payload.info === 'string' ? payload.info.slice(0, 4000) : JSON.stringify(payload.info ?? {})
  const store = await getStore()
  await store.createAlarm({
    id: newId('al'),
    hostId,
    type: Number(payload.typ) || 0,
    info,
    ip: alarmDetails(info).ip.slice(0, 64),
    createdAt: new Date().toISOString(),
  })
  return NextResponse.json({ code: 0, message: 'success', data: '' })
}
