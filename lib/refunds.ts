import { randomUUID } from 'node:crypto'
import { config } from './config'
import { AUTOPAY_OFF, refundedAmount } from './billing-model'
import { paymentDescription } from './billing'
import { sendRefundNotice } from './billing-mail'
import { formatPrice } from './plans'
import { getStore } from './store'
import { createRefund, getRefund, receiptBlock, yookassaConfigured, YookassaError } from './yookassa'
import type { Payment, PaymentRefund } from './types'

/**
 * Возвраты из админки. По платежам ЮKassa — через API, с чеком возврата;
 * по оплатам по счёту деньги возвращают переводом, а здесь это отмечают.
 */

export class RefundError extends Error {}

export interface RefundInput {
  /** Копейки; не больше того, что ещё не вернули. */
  amount: number
  reason: string
  /** Отключить подписку сразу (и автопродление). */
  cancelSubscription: boolean
  adminEmail: string
}

export async function refundPayment(paymentId: string, input: RefundInput): Promise<Payment> {
  const store = await getStore()
  const payment = await store.findPaymentById(paymentId)
  if (!payment) throw new RefundError('Платёж не найден')
  if (payment.status !== 'succeeded') throw new RefundError('Вернуть можно только оплаченный платёж')

  const remaining = payment.amount - refundedAmount(payment)
  const amount = Math.round(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new RefundError('Укажите сумму возврата')
  if (amount > remaining) throw new RefundError(`Вернуть можно не больше ${formatPrice(remaining)}`)
  const reason = input.reason.replace(/\s+/g, ' ').trim().slice(0, 250) || 'Возврат по заявлению покупателя'

  const refund: PaymentRefund = {
    id: `ref_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    providerRefundId: '',
    amount,
    status: 'succeeded',
    reason,
    createdAt: new Date().toISOString(),
    createdBy: input.adminEmail,
  }

  if (payment.provider === 'yookassa' && payment.providerPaymentId) {
    if (!yookassaConfigured()) throw new RefundError('ЮKassa не настроена')
    // Чек возврата — с тем же признаком расчёта, что у последнего чека прихода:
    // после второго чека («полный расчёт») возвращаем уже полный расчёт.
    const mode =
      config.billing.receipts.mode === 'prepayment' && payment.settlement !== 'sent' ? 'full_prepayment' : 'full_payment'
    try {
      const remote = await createRefund({
        paymentId: payment.providerPaymentId,
        amount,
        description: reason,
        // Номер попытки в ключе: повторное нажатие не создаст второй возврат.
        idempotenceKey: `refund-${payment.id}-${payment.refunds.length + 1}-${amount}`,
        receipt: config.billing.receipts.enabled
          ? receiptBlock(payment.receiptEmail || (await store.findUserById(payment.userId))?.email || '', paymentDescription(payment), amount, mode)
          : null,
      })
      refund.providerRefundId = remote.id
      refund.status = remote.status
    } catch (error) {
      if (error instanceof YookassaError) throw new RefundError(`ЮKassa отказала: ${error.message}`)
      throw error
    }
    if (refund.status === 'canceled') throw new RefundError('ЮKassa отклонила возврат')
  }

  const updated: Payment = { ...payment, refunds: [...payment.refunds, refund] }
  await store.savePayment(updated)

  if (input.cancelSubscription) {
    const subscription = await store.getActiveSubscription(payment.userId)
    if (subscription) await store.saveSubscription({ ...subscription, ...AUTOPAY_OFF, status: 'canceled', renewError: 'подписка отменена с возвратом' })
  }

  const user = await store.findUserById(payment.userId)
  if (user && user.status === 'active') await sendRefundNotice(user, updated, refund, input.cancelSubscription)
  console.info(`[refund] ${payment.id}: ${formatPrice(amount)} (${refund.status}), оформил ${input.adminEmail}`)
  return updated
}

/** Досинхронизация возвратов, которые ЮKassa ещё проводит. */
export async function syncPendingRefunds(limit = 20): Promise<number> {
  if (!yookassaConfigured()) return 0
  const store = await getStore()
  let updated = 0
  for (const payment of await store.listRecentPayments(200)) {
    const pending = payment.refunds.filter((refund) => refund.status === 'pending' && refund.providerRefundId)
    if (!pending.length) continue
    const refunds = await Promise.all(
      payment.refunds.map(async (refund) => {
        if (refund.status !== 'pending' || !refund.providerRefundId) return refund
        try {
          return { ...refund, status: (await getRefund(refund.providerRefundId)).status }
        } catch {
          return refund
        }
      }),
    )
    if (JSON.stringify(refunds) !== JSON.stringify(payment.refunds)) {
      await store.savePayment({ ...payment, refunds })
      updated += 1
    }
    if (updated >= limit) break
  }
  return updated
}
