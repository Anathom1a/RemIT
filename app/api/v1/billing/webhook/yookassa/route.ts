import { NextResponse } from 'next/server'
import { fetchYookassaPayment, markPaymentPaid } from '@/lib/billing'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Вебхук ЮKassa. Телу уведомления не доверяем: берём из него только id
 * платежа и перезапрашиваем статус в API ЮKassa.
 */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const providerPaymentId = String(payload?.object?.id ?? '')
  if (!providerPaymentId) {
    return NextResponse.json({ error: 'no payment id' }, { status: 400 })
  }

  let remote
  try {
    remote = await fetchYookassaPayment(providerPaymentId)
  } catch {
    // Отдаём 500, чтобы ЮKassa повторила уведомление позже.
    return NextResponse.json({ error: 'upstream error' }, { status: 500 })
  }

  const store = await getStore()
  const payment =
    (await store.findPaymentByProviderId(providerPaymentId)) ??
    (remote.metadata.paymentId ? await store.findPaymentById(remote.metadata.paymentId) : null)

  if (!payment) {
    return NextResponse.json({ error: 'payment not found' }, { status: 404 })
  }

  if (remote.status === 'succeeded') {
    await markPaymentPaid({ ...payment, providerPaymentId })
    return NextResponse.json({ ok: true, status: 'succeeded' })
  }

  if (remote.status === 'canceled' && payment.status === 'pending') {
    await store.savePayment({ ...payment, status: 'canceled' })
  }

  return NextResponse.json({ ok: true, status: remote.status })
}
