import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getClientPolicy, setClientPolicy } from '@/lib/policy'

export const dynamic = 'force-dynamic'

/** Текущая политика клиентов. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  return NextResponse.json({ policy: await getClientPolicy() })
}

/**
 * Замена политики целиком. Новая версия разъезжается по клиентам с ближайшим
 * heartbeat — до 15 секунд на клиента.
 *
 * Тело: { "options": { "custom-rendezvous-server": "remit.su", ... } }
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const options = payload.options
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    return NextResponse.json({ error: 'Нужен объект options' }, { status: 400 })
  }
  if (Object.keys(options).length > 100) {
    return NextResponse.json({ error: 'Слишком много настроек' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, policy: await setClientPolicy(options as Record<string, string>) })
}
