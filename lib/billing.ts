import { randomUUID } from 'node:crypto'
import { config } from './config'
import { getPlan, isFreePlan, type PlanId } from './plans'
import { getStore } from './store'
import { newId } from './auth'
import type { Payment, Subscription, User } from './types'

/**
 * Оплата подписки. Провайдер выбирается переменной REMIT_BILLING_PROVIDER:
 *   yookassa — приём карт через ЮKassa (боевой режим);
 *   manual   — счёт выставляется вручную, оплату подтверждает администратор
 *              через POST /api/v1/billing/confirm с сервисным токеном.
 */

export interface CheckoutResult {
  payment: Payment
  /** Куда отправить пользователя: страница оплаты провайдера или кабинет. */
  redirectUrl: string
}

/** Стоимость заказа: месячная цена × месяцы, для 12 месяцев — годовая цена. */
export function calculateAmount(planId: PlanId, months: number): number {
  const plan = getPlan(planId)
  if (months >= 12) {
    const years = Math.floor(months / 12)
    const rest = months % 12
    return plan.priceYearly * years + plan.priceMonthly * rest
  }
  return plan.priceMonthly * months
}

export async function createCheckout(user: User, planId: PlanId, months: number): Promise<CheckoutResult> {
  const plan = getPlan(planId)
  if (isFreePlan(planId)) {
    throw new Error('Бесплатный тариф не требует оплаты')
  }
  if (plan.negotiable) {
    throw new Error(
      `Тариф «${plan.name}» оформляется по договору: число одновременных сессий и цена согласовываются отдельно. Напишите в отдел продаж — выставим счёт.`,
    )
  }
  const amount = calculateAmount(planId, months)
  const store = await getStore()
  const payment: Payment = {
    id: newId('pay'),
    userId: user.id,
    plan: planId,
    months,
    amount,
    status: 'pending',
    provider: config.billing.provider,
    providerPaymentId: '',
    confirmationUrl: '',
    createdAt: new Date().toISOString(),
    paidAt: null,
  }

  if (config.billing.provider === 'yookassa') {
    if (!config.billing.yookassa.shopId || !config.billing.yookassa.secretKey) {
      throw new Error('ЮKassa не настроена: заполните YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY')
    }
    const created = await createYookassaPayment(payment, plan.name, user.email)
    payment.providerPaymentId = created.id
    payment.confirmationUrl = created.confirmationUrl
  } else {
    payment.confirmationUrl = `/kabinet/podpiska?schet=${payment.id}`
  }

  await store.createPayment(payment)
  return { payment, redirectUrl: payment.confirmationUrl }
}

interface YookassaPayment {
  id: string
  status: string
  confirmationUrl: string
  metadata: Record<string, string>
}

function yookassaAuthHeader(): string {
  const { shopId, secretKey } = config.billing.yookassa
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`
}

async function createYookassaPayment(payment: Payment, planName: string, email: string): Promise<YookassaPayment> {
  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotence-Key': randomUUID(),
      Authorization: yookassaAuthHeader(),
    },
    body: JSON.stringify({
      amount: { value: (payment.amount / 100).toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: config.billing.yookassa.returnUrl },
      description: `${config.brand.name}: тариф «${planName}», ${payment.months} мес.`,
      metadata: { paymentId: payment.id, userId: payment.userId, plan: payment.plan, months: String(payment.months) },
      receipt: {
        customer: { email },
        items: [
          {
            description: `Подписка ${config.brand.name} «${planName}», ${payment.months} мес.`,
            quantity: '1.00',
            amount: { value: (payment.amount / 100).toFixed(2), currency: 'RUB' },
            vat_code: 1,
            payment_mode: 'full_prepayment',
            payment_subject: 'service',
          },
        ],
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`ЮKassa вернула ошибку ${response.status}: ${text}`)
  }

  const data = (await response.json()) as any
  return {
    id: data.id,
    status: data.status,
    confirmationUrl: data.confirmation?.confirmation_url ?? '',
    metadata: data.metadata ?? {},
  }
}

/** Повторно запрашивает статус платежа у ЮKassa: вебхуку нельзя доверять на слово. */
export async function fetchYookassaPayment(providerPaymentId: string): Promise<YookassaPayment> {
  const response = await fetch(`https://api.yookassa.ru/v3/payments/${providerPaymentId}`, {
    headers: { Authorization: yookassaAuthHeader() },
  })
  if (!response.ok) {
    throw new Error(`ЮKassa вернула ошибку ${response.status}`)
  }
  const data = (await response.json()) as any
  return {
    id: data.id,
    status: data.status,
    confirmationUrl: data.confirmation?.confirmation_url ?? '',
    metadata: data.metadata ?? {},
  }
}

/** Продлевает подписку: от текущей даты окончания, если она ещё не прошла. */
export async function activateSubscription(
  userId: string,
  plan: PlanId,
  months: number,
  provider: string,
  providerId: string,
  /** Персональный лимит одновременных сессий — для корпоративных договоров. */
  concurrentSessions?: number | null,
): Promise<Subscription> {
  const store = await getStore()
  const now = new Date()
  const current = await store.getActiveSubscription(userId)
  const base = current && current.plan === plan ? new Date(current.expiresAt) : now
  const from = base.getTime() > now.getTime() ? base : now
  const expiresAt = new Date(from)
  expiresAt.setMonth(expiresAt.getMonth() + months)

  const subscription: Subscription = {
    id: current && current.plan === plan ? current.id : newId('sub'),
    userId,
    plan,
    status: 'active',
    startedAt: current && current.plan === plan ? current.startedAt : now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    autoRenew: false,
    provider,
    providerId,
    // Явно переданное значение важнее; иначе сохраняем согласованный ранее лимит.
    concurrentSessions:
      concurrentSessions === undefined
        ? (current && current.plan === plan ? current.concurrentSessions : null)
        : concurrentSessions,
  }

  if (current && current.plan !== plan) {
    await store.saveSubscription({ ...current, status: 'canceled' })
  }
  await store.saveSubscription(subscription)
  return subscription
}

/** Отмечает платёж оплаченным и включает подписку. Идемпотентно. */
export async function markPaymentPaid(payment: Payment): Promise<Subscription | null> {
  const store = await getStore()
  if (payment.status === 'succeeded') return store.getActiveSubscription(payment.userId)
  const paid: Payment = { ...payment, status: 'succeeded', paidAt: new Date().toISOString() }
  await store.savePayment(paid)
  return activateSubscription(paid.userId, paid.plan, paid.months, paid.provider, paid.providerPaymentId)
}

/**
 * Досинхронизация ожидающих платежей ЮKassa.
 *
 * Вебхук — основной путь, но он может не дойти: истёк сертификат, упала сеть,
 * админ забыл включить уведомления. Кабинет при открытии перепроверяет статусы
 * недавних pending-платежей напрямую в API ЮKassa, поэтому подписка включается
 * даже без вебхука — максимум с задержкой до захода пользователя в кабинет.
 */
export async function syncPendingPayments(userId: string, limit = 5): Promise<number> {
  if (config.billing.provider !== 'yookassa') return 0
  if (!config.billing.yookassa.shopId || !config.billing.yookassa.secretKey) return 0

  const store = await getStore()
  const payments = await store.listPaymentsByUser(userId, 20)
  const pending = payments.filter((p) => p.status === 'pending' && p.providerPaymentId).slice(0, limit)

  let updated = 0
  for (const payment of pending) {
    try {
      const remote = await fetchYookassaPayment(payment.providerPaymentId)
      if (remote.status === 'succeeded') {
        await markPaymentPaid(payment)
        updated += 1
      } else if (remote.status === 'canceled') {
        await store.savePayment({ ...payment, status: 'canceled' })
        updated += 1
      }
    } catch {
      // ЮKassa недоступна — попробуем при следующем открытии кабинета.
    }
  }
  return updated
}

/**
 * Пробный период для компании: подписка на выбранный тариф на N дней.
 * Оформляется отдельно от оплаты — провайдер помечается как trial, чтобы
 * в админке и в кабинете было видно, что это проба, а не покупка.
 */
export async function activateTrial(
  userId: string,
  plan: PlanId,
  days: number,
  concurrentSessions?: number | null,
): Promise<Subscription> {
  const store = await getStore()
  const now = new Date()
  const current = await store.getActiveSubscription(userId)

  const expiresAt = new Date(now.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000)
  const subscription: Subscription = {
    id: current ? current.id : newId('sub'),
    userId,
    plan,
    status: 'active',
    startedAt: now.toISOString(),
    // Если подписка уже действует дольше пробного периода, не укорачиваем её.
    expiresAt:
      current && new Date(current.expiresAt).getTime() > expiresAt.getTime()
        ? current.expiresAt
        : expiresAt.toISOString(),
    autoRenew: false,
    provider: 'trial',
    providerId: `trial-${days}d`,
    concurrentSessions:
      concurrentSessions === undefined ? (current?.concurrentSessions ?? null) : concurrentSessions,
  }

  await store.saveSubscription(subscription)
  return subscription
}
