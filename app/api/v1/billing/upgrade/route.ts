import { NextResponse } from 'next/server'
import { paymentBlockedReason } from '@/lib/email-verification'
import { getCurrentUser } from '@/lib/auth'
import { CheckoutError, createUpgradeCheckout, quoteUpgrade } from '@/lib/billing'
import { PLANS_BY_ID, type PlanId } from '@/lib/plans'

export const dynamic = 'force-dynamic'

function parsePlan(value: unknown): PlanId | null {
  const plan = String(value ?? '')
  return plan in PLANS_BY_ID ? (plan as PlanId) : null
}

/**
 * Расчёт доплаты за переход на старший тариф: GET ?plan=business.
 * Кабинет считает то же самое на сервере при отрисовке, маршрут нужен
 * скриптам и для проверки.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const plan = parsePlan(new URL(request.url).searchParams.get('plan'))
  if (!plan) return NextResponse.json({ error: 'Неизвестный тариф' }, { status: 400 })

  try {
    const quote = await quoteUpgrade(user.id, plan)
    return NextResponse.json({
      from: quote.from.id,
      to: quote.to.id,
      remainingDays: quote.remainingDays,
      until: quote.until,
      amount: quote.amount,
      basis: quote.basis,
    })
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}

/** Заказ доплаты: { "plan": "business" } → ссылка на оплату. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // До подтверждения почты не принимаем оплату: чеки уйдут в никуда.
  const blocked = paymentBlockedReason(user)
  if (blocked) return NextResponse.json({ error: blocked, code: 'email_unverified' }, { status: 403 })

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const plan = parsePlan(payload.plan)
  if (!plan) return NextResponse.json({ error: 'Неизвестный тариф' }, { status: 400 })

  try {
    const { payment, redirectUrl } = await createUpgradeCheckout(user, plan)
    return NextResponse.json({ paymentId: payment.id, amount: payment.amount, redirectUrl })
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[billing] не удалось создать доплату:', error)
    return NextResponse.json(
      { error: 'Оплата временно недоступна. Попробуйте позже или напишите в поддержку.' },
      { status: 502 },
    )
  }
}
