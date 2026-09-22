import { NextResponse } from 'next/server'
import { isServiceRequest } from '@/lib/auth'
import { markPaymentPaid } from '@/lib/billing'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Ручное подтверждение оплаты (счёт, перевод, касса).
 * Требует сервисный токен: это действие администратора, не пользователя.
 */
export async function POST(request: Request) {
  if (!isServiceRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const paymentId = String(payload.paymentId ?? '')
  if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 })

  const store = await getStore()
  const payment = await store.findPaymentById(paymentId)
  if (!payment) return NextResponse.json({ error: 'payment not found' }, { status: 404 })

  const subscription = await markPaymentPaid(payment)
  return NextResponse.json({ ok: true, subscription })
}
