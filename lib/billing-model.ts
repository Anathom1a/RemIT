import type { Payment, Subscription } from './types'

/**
 * Ошибка, которую можно показать покупателю как есть: неверный тариф, переход
 * не туда, промокод не подходит и тому подобное. Всё остальное (сбой ЮKassa,
 * не заданы ключи) пишется в журнал, а покупатель видит нейтральное «оплата
 * недоступна».
 */
export class CheckoutError extends Error {}

/**
 * Значения по умолчанию для полей автопродления и чеков. Нужны и новым
 * записям, и старым: в хранилище они появились позже.
 */

export type AutopayFields = Pick<
  Subscription,
  | 'paymentMethodId'
  | 'paymentMethodTitle'
  | 'renewMonths'
  | 'renewAttempts'
  | 'renewNextAt'
  | 'renewNoticeFor'
  | 'renewError'
  | 'expiryNoticeFor'
>

/** Автопродление выключено, способа оплаты нет. */
export const AUTOPAY_OFF: AutopayFields & { autoRenew: false } = {
  autoRenew: false,
  paymentMethodId: '',
  paymentMethodTitle: '',
  renewMonths: 1,
  renewAttempts: 0,
  renewNextAt: null,
  renewNoticeFor: null,
  renewError: '',
  expiryNoticeFor: null,
}

export type PaymentExtras = Pick<
  Payment,
  | 'recurring'
  | 'saveMethod'
  | 'subscriptionId'
  | 'idempotenceKey'
  | 'failureReason'
  | 'receiptEmail'
  | 'serviceEndsAt'
  | 'settlement'
  | 'receipts'
  | 'refunds'
  | 'documentNumber'
  | 'buyer'
  | 'concurrentSessions'
  | 'promoCode'
  | 'discount'
>

export function paymentExtras(): PaymentExtras {
  return {
    recurring: false,
    saveMethod: false,
    subscriptionId: null,
    idempotenceKey: '',
    failureReason: '',
    receiptEmail: '',
    serviceEndsAt: null,
    settlement: '',
    receipts: [],
    refunds: [],
    documentNumber: '',
    buyer: null,
    concurrentSessions: null,
    promoCode: '',
    discount: 0,
  }
}

/** Сколько уже вернули (и возвращается) по платежу. */
export const refundedAmount = (payment: Payment) =>
  (payment.refunds ?? []).filter((refund) => refund.status !== 'canceled').reduce((sum, refund) => sum + refund.amount, 0)

/** Дополняет запись из старого снимка хранилища недостающими полями. */
export function normalizeSubscription(subscription: Subscription): Subscription {
  return { ...AUTOPAY_OFF, ...subscription, autoRenew: Boolean(subscription.autoRenew) }
}

export function normalizePayment(payment: Payment): Payment {
  return {
    ...paymentExtras(),
    ...payment,
    kind: payment.kind ?? 'subscription',
    fromPlan: payment.fromPlan ?? null,
    upgradeUntil: payment.upgradeUntil ?? null,
    receipts: payment.receipts ?? [],
    refunds: payment.refunds ?? [],
  }
}
