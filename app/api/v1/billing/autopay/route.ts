import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { disableAutopay } from '@/lib/billing'

export const dynamic = 'force-dynamic'

/**
 * Отключение автопродления из кабинета: {action: "disable"}. Сохранённый
 * способ оплаты забывается, оплаченный срок остаётся. Включается оно снова
 * при следующей оплате — отметкой «Продлевать автоматически».
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (body.action !== 'disable') return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  const subscription = await disableAutopay(user.id)
  if (!subscription) return NextResponse.json({ error: 'Активной подписки нет' }, { status: 404 })
  console.info(`[billing] ${user.id}: автопродление отключено в кабинете`)
  return NextResponse.json({ ok: true })
}
