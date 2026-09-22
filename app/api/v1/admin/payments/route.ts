import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { markPaymentPaid } from '@/lib/billing'
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

/** Подтверждение оплаты по счёту и отмена зависшего платежа. */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const paymentId = String(payload.paymentId ?? '')
  const action = String(payload.action ?? 'confirm')

  const store = await getStore()
  const payment = await store.findPaymentById(paymentId)
  if (!payment) return NextResponse.json({ error: 'Платёж не найден' }, { status: 404 })

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
