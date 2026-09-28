import { NextResponse } from 'next/server'
import { isServiceRequest } from '@/lib/auth'
import { userByClientToken } from '@/lib/client-api'
import { checkQuota, closeStaleSessions, resolveSubject, userSubject } from '@/lib/quota'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Предварительная проверка для hbbs: вызывается перед выдачей punch hole.
 * Запрос подписан сервисным токеном (REMIT_SERVICE_TOKEN).
 *
 * Тело: { "id": "<ID управляемого>", "token": "<токен входа управляющего>", "peer_id": "<ID управляющего>" }
 * Токен входа hbbs берёт из punch hole: по нему видно аккаунт того, кто
 * подключается, и лимит проверяется по его тарифу.
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
  const account = typeof payload.token === 'string' && payload.token ? await userByClientToken(payload.token) : null
  const subject = account ? userSubject(account.id) : await resolveSubject(store, controllerId, hostId)
  const decision = await checkQuota(subject)

  return NextResponse.json({
    allowed: decision.allowed,
    reason: decision.reason,
    message: decision.message,
    remaining_seconds: decision.state.remainingSeconds,
    plan: decision.state.planId,
  })
}
