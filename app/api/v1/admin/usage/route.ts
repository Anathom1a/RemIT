import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getStore } from '@/lib/store'
import { billingDay } from '@/lib/time'

export const dynamic = 'force-dynamic'

/**
 * Обнуление суточного расхода. Нужно, когда время списалось из-за сбоя или
 * когда клиенту дарят дополнительные часы без выдачи подписки.
 *
 * Тело: { "userId": "usr_..." } или { "subjectKey": "device:741208365" }
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const userId = String(payload.userId ?? '')
  const subjectKey = userId ? `user:${userId}` : String(payload.subjectKey ?? '')
  if (!subjectKey) return NextResponse.json({ error: 'Нужен userId или subjectKey' }, { status: 400 })

  const day = String(payload.day ?? billingDay())
  const store = await getStore()
  await store.resetUsage(subjectKey, day)

  return NextResponse.json({ ok: true, subjectKey, day })
}
