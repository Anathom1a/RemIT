import { NextResponse } from 'next/server'
import { isServiceRequest } from '@/lib/auth'
import { checkQuota, closeStaleSessions, resolveSubject } from '@/lib/quota'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Предварительная проверка для hbbs: вызывается перед выдачей punch hole.
 * Запрос подписан сервисным токеном (REMIT_SERVICE_TOKEN).
 *
 * Тело: { "peer_id": "<ID управляющего>", "id": "<ID управляемого>" }
 * Ответ: { "allowed": true|false, "reason": "...", "message": "текст для клиента" }
 */
export async function POST(request: Request) {
  if (!isServiceRequest(request)) {
    return NextResponse.json({ allowed: true, reason: 'unauthorized', message: '' }, { status: 401 })
  }

  let payload: Record<string, any> = {}
  try {
    payload = (await request.json()) as Record<string, any>
  } catch {
    return NextResponse.json({ allowed: true, reason: 'invalid_json', message: '' }, { status: 400 })
  }

  const hostId = String(payload.id ?? '')
  const controllerId = String(payload.peer_id ?? '')
  if (!hostId && !controllerId) {
    return NextResponse.json({ allowed: true, reason: 'no_ids', message: '' })
  }

  // Подвисшие сессии не должны занимать лимит одновременных подключений.
  await closeStaleSessions()

  const store = await getStore()
  const subject = await resolveSubject(store, controllerId, hostId)
  const decision = await checkQuota(subject)

  return NextResponse.json({
    allowed: decision.allowed,
    reason: decision.reason,
    message: decision.message,
    remaining_seconds: decision.state.remainingSeconds,
    plan: decision.state.planId,
  })
}
