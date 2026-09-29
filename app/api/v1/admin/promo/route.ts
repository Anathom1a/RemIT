import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getCurrentUser } from '@/lib/auth'
import { CheckoutError } from '@/lib/billing-model'
import { normalizeCode, parsePromoInput } from '@/lib/promo'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  return NextResponse.json({ promoCodes: await (await getStore()).listPromoCodes() })
}

/**
 * Промокоды: {action: "create", code, kind, value, plans, months, maxUses,
 * validUntil, firstPaymentOnly, note}, "toggle" и "delete" с {code}.
 * Удалить можно только неприменённый код — иначе выключить.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const store = await getStore()
  const action = String(payload.action ?? 'create')

  if (action === 'create') {
    try {
      const admin = await getCurrentUser()
      const promo = parsePromoInput(payload, null, admin?.email ?? 'service')
      if (await store.findPromoCode(promo.code)) {
        return NextResponse.json({ error: `Код ${promo.code} уже есть` }, { status: 409 })
      }
      await store.savePromoCode(promo)
      return NextResponse.json({ ok: true, promo })
    } catch (error) {
      if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: 400 })
      throw error
    }
  }

  const promo = await store.findPromoCode(normalizeCode(payload.code))
  if (!promo) return NextResponse.json({ error: 'Промокод не найден' }, { status: 404 })

  if (action === 'toggle') {
    await store.savePromoCode({ ...promo, active: !promo.active })
    return NextResponse.json({ ok: true, active: !promo.active })
  }
  if (action === 'delete') {
    if (promo.usedCount > 0) {
      return NextResponse.json({ error: 'Промокод уже применяли — его можно только выключить' }, { status: 409 })
    }
    await store.deletePromoCode(promo.code)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
}
