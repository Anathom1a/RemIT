import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { markPaymentPaid } from '@/lib/billing'
import { getCurrentUser } from '@/lib/auth'
import { RefundError, refundPayment } from '@/lib/refunds'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Последние платежи по всем пользователям. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const url = new URL(request.url)
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))

  const store = await getStore()
  const payments = await store.listRecentPayments(limit)
  const rows = await Promise.all(
    payments.map(async (payment) => ({
      ...payment,
      email: (await store.findUserById(payment.userId))?.email ?? '—',
    })),
  )
  return NextResponse.json({ payments: rows })
}

/**
 * Подтверждение оплаты по счёту, отмена зависшего платежа и возврат:
 * {paymentId, action: "refund", amount: "890.00", reason, cancelSubscription}.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const paymentId = String(payload.paymentId ?? '')
  const action = String(payload.action ?? 'confirm')

  const store = await getStore()
  const payment = await store.findPaymentById(paymentId)
  if (!payment) return NextResponse.json({ error: 'Платёж не найден' }, { status: 404 })

  if (action === 'refund') {
    const admin = await getCurrentUser()
    try {
      const updated = await refundPayment(payment.id, {
        // В форме — рубли, внутри — копейки.
        amount: Math.round(Number.parseFloat(String(payload.amount ?? '0').replace(',', '.')) * 100),
        reason: String(payload.reason ?? ''),
        cancelSubscription: payload.cancelSubscription === true,
        adminEmail: admin?.email ?? 'service',
      })
      return NextResponse.json({ ok: true, payment: updated })
    } catch (error) {
      if (error instanceof RefundError) return NextResponse.json({ error: error.message }, { status: 400 })
      throw error
    }
  }

  if (action === 'cancel') {
    if (payment.status === 'succeeded') {
      return NextResponse.json({ error: 'Оплаченный платёж отменить нельзя' }, { status: 409 })
    }
    await store.savePayment({ ...payment, status: 'canceled' })
    return NextResponse.json({ ok: true, action: 'cancel' })
  }

  const subscription = await markPaymentPaid(payment)
  return NextResponse.json({ ok: true, action: 'confirm', subscription })
}
