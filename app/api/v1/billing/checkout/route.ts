import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createCheckout } from '@/lib/billing'
import { PLANS_BY_ID, getPlan, type PlanId } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** Создаёт заказ на подписку и возвращает ссылку на оплату. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
    const { payment, redirectUrl } = await createCheckout(user, plan, months)
    return NextResponse.json({ paymentId: payment.id, amount: payment.amount, redirectUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось создать платёж'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
