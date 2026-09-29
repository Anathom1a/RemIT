import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { CheckoutError, createCheckout } from '@/lib/billing'
import { paymentBlockedReason } from '@/lib/email-verification'
import { PLANS_BY_ID, getPlan, type PlanId } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** Создаёт заказ на подписку и возвращает ссылку на оплату. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // До подтверждения почты не принимаем оплату: чеки уйдут в никуда.
  const blocked = paymentBlockedReason(user)
  if (blocked) return NextResponse.json({ error: blocked, code: 'email_unverified' }, { status: 403 })

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const plan = String(payload.plan ?? '') as PlanId
  const months = Math.min(24, Math.max(1, Number.parseInt(String(payload.months ?? '1'), 10) || 1))

  if (!(plan in PLANS_BY_ID) || PLANS_BY_ID[plan].priceMonthly === 0) {
    const selected = getPlan(plan)
    if (selected.negotiable) {
      return NextResponse.json(
        {
          error: `Тариф «${selected.name}» оформляется по договору: напишите в отдел продаж, мы согласуем число сессий и выставим счёт.`,
        },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Неизвестный тариф' }, { status: 400 })
  }

  try {
    const { payment, redirectUrl } = await createCheckout(user, plan, months, { autoRenew: payload.autoRenew === true })
    return NextResponse.json({ paymentId: payment.id, amount: payment.amount, redirectUrl })
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    // Подробности — в журнал сервера: пользователю незачем видеть, какие
    // ключи платёжного сервиса не заполнены.
    console.error('[billing] не удалось создать платёж:', error)
    return NextResponse.json(
      { error: 'Оплата временно недоступна. Попробуйте позже или напишите в поддержку.' },
      { status: 502 },
    )
  }
}
