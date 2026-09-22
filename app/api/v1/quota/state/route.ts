import { NextResponse } from 'next/server'
import { getCurrentUser, isServiceRequest } from '@/lib/auth'
import { deviceSubject, getQuotaState, resolveSubject, userSubject } from '@/lib/quota'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Остаток бесплатного времени.
 *   - для кабинета: GET /api/v1/quota/state с cookie-сессией;
 *   - для клиента и служб: GET /api/v1/quota/state?device=<ID> с сервисным токеном.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const deviceId = url.searchParams.get('device') ?? ''

  if (deviceId) {
    if (!isServiceRequest(request)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const store = await getStore()
    const subject = await resolveSubject(store, deviceId, deviceId)
    return NextResponse.json(await getQuotaState(subject))
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await getQuotaState(userSubject(user.id)))
}

/** Явный расчёт для произвольного устройства — используется в отладке и в кабинете. */
export async function POST(request: Request) {
  if (!isServiceRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const deviceId = String(payload.device ?? '')
  if (!deviceId) return NextResponse.json({ error: 'device required' }, { status: 400 })
  return NextResponse.json(await getQuotaState(deviceSubject(deviceId)))
}
