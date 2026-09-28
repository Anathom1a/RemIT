import { randomUUID } from 'node:crypto'
import { config } from './config'
import { getPlan, isFreePlan, planRank, type Plan, type PlanId } from './plans'
import { getStore } from './store'
import { newId } from './auth'
import { formatDate } from './time'
import type { Payment, Subscription, User } from './types'

/**
 * Оплата подписки. Провайдер выбирается переменной REMIT_BILLING_PROVIDER:
 *   yookassa — приём карт через ЮKassa (боевой режим);
 *   manual   — счёт выставляется вручную, оплату подтверждает администратор
 *              через POST /api/v1/billing/confirm с сервисным токеном.
 */

/**
 * Ошибка, которую можно показать покупателю как есть: неверный тариф, переход
 * не туда и тому подобное. Всё остальное (сбой ЮKassa, не заданы ключи)
 * пишется в журнал, а покупатель видит нейтральное «оплата недоступна».
 */
export class CheckoutError extends Error {}

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
    throw new CheckoutError('Бесплатный тариф не требует оплаты')
  }
  if (plan.negotiable) {
    throw new CheckoutError(
      `Тариф «${plan.name}» оформляется по договору: число одновременных сессий и цена согласовываются отдельно. Напишите в отдел продаж — выставим счёт.`,
    )
  }
  const store = await getStore()

  // Покупка другого тарифа поверх оплаченной подписки раньше отменяла её и
  // начинала новую с сегодняшнего дня — оплаченные дни сгорали. Теперь на
  // старший тариф переходят доплатой, на младший — после окончания срока.
  const current = await store.getActiveSubscription(user.id)
  if (current && current.provider !== 'trial' && current.plan !== planId) {
    const currentPlan = getPlan(current.plan)
    throw new CheckoutError(
      planRank(planId) > planRank(current.plan)
        ? `Перейти на «${plan.name}» можно доплатой только за оставшиеся дни тарифа «${currentPlan.name}» — кнопка на карточке тарифа.`
        : `Тариф «${currentPlan.name}» оплачен до ${formatDate(current.expiresAt)}. Перейти на «${plan.name}» можно после окончания срока.`,
    )
  }

  const amount = calculateAmount(planId, months)
  const payment: Payment = {
    id: newId('pay'),
    userId: user.id,
    kind: 'subscription',
    plan: planId,
    fromPlan: null,
    upgradeUntil: null,
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
    const created = await createYookassaPayment(payment, `тариф «${plan.name}», ${months} мес.`, user.email)
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

async function createYookassaPayment(payment: Payment, what: string, email: string): Promise<YookassaPayment> {
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
      description: `${config.brand.name}: ${what}`,
      metadata: {
        paymentId: payment.id,
        userId: payment.userId,
        kind: payment.kind,
        plan: payment.plan,
        months: String(payment.months),
      },
      receipt: {
        customer: { email },
        items: [
          {
            description: `Подписка ${config.brand.name}: ${what}`,
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
  if (paid.kind === 'upgrade') return applyUpgrade(paid)
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

/* --------------------------------------------------------------------------
 * Повышение тарифа до конца оплаченного срока
 *
 * Человек на «Профи», оплаченном до 12 октября, переходит на «Бизнес» сразу и
 * до того же 12 октября, доплачивая только разницу в цене за оставшиеся дни.
 * Срок не продлевается — продлить можно потом обычной оплатой уже нового
 * тарифа.
 * ------------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000

export interface UpgradeQuote {
  from: Plan
  to: Plan
  /** Сколько дней остаётся, с округлением вверх: начатый день тоже оплачен. */
  remainingDays: number
  /** Конец текущей подписки — до него действует новый тариф. */
  until: string
  /** Доплата в копейках, округлена вверх до рубля. */
  amount: number
  /**
   * По какой цене считали: подписку, купленную на год, пересчитываем по
   * годовым ценам — иначе доплата съела бы скидку за год.
   */
  basis: 'month' | 'year'
}

/**
 * Сколько стоит перейти на тариф toPlanId до конца текущей подписки.
 * Бросает CheckoutError с понятным объяснением, если переход невозможен.
 */
export async function quoteUpgrade(userId: string, toPlanId: PlanId, now = new Date()): Promise<UpgradeQuote> {
  const store = await getStore()
  const current = await store.getActiveSubscription(userId)
  const to = getPlan(toPlanId)

  if (!current) {
    throw new CheckoutError('Активной подписки нет — выберите тариф и оплатите его целиком.')
  }
  if (current.provider === 'trial') {
    // За пробный период не платили, пересчитывать нечего.
    throw new CheckoutError('Во время пробного периода тариф оплачивается целиком — доплата не нужна.')
  }
  const from = getPlan(current.plan)
  if (from.negotiable || to.negotiable || to.priceMonthly === 0) {
    throw new CheckoutError('Условия корпоративного тарифа согласовываются отдельно — напишите в отдел продаж.')
  }
  if (planRank(to.id) <= planRank(from.id)) {
    throw new CheckoutError(`Тариф «${to.name}» не старше текущего «${from.name}».`)
  }

  const remainingMs = new Date(current.expiresAt).getTime() - now.getTime()
  if (remainingMs <= 0) {
    throw new CheckoutError('Срок подписки уже закончился — оформите новый тариф.')
  }
  const remainingDays = Math.ceil(remainingMs / DAY_MS)

  // Как была оплачена текущая подписка: последний платёж за этот тариф.
  // Подписку, выданную вручную, считаем по месячной цене.
  const payments = await store.listPaymentsByUser(userId, 50)
  const lastPaid = payments.find(
    (payment) => payment.status === 'succeeded' && payment.kind === 'subscription' && payment.plan === from.id,
  )
  const basis: 'month' | 'year' = lastPaid && lastPaid.months >= 12 ? 'year' : 'month'

  // Разница цены за период × оставшиеся дни / дней в периоде. Сначала
  // умножаем, потом делим и округляем до копейки: иначе погрешность дробей
  // (160000.00000000003) при округлении вверх до рубля даёт лишний рубль.
  const period = basis === 'year' ? 365 : 30
  const priceDiff =
    basis === 'year' ? to.priceYearly - from.priceYearly : to.priceMonthly - from.priceMonthly
  const kopecks = Math.round((priceDiff * remainingDays) / period)
  // До рубля вверх, но не меньше рубля: ЮKassa не принимает платёж дешевле.
  const amount = Math.max(100, Math.ceil(kopecks / 100) * 100)

  return { from, to, remainingDays, until: current.expiresAt, amount, basis }
}

/** Создаёт платёж за повышение тарифа. */
export async function createUpgradeCheckout(user: User, toPlanId: PlanId): Promise<CheckoutResult> {
  const quote = await quoteUpgrade(user.id, toPlanId)
  const store = await getStore()

  const payment: Payment = {
    id: newId('pay'),
    userId: user.id,
    kind: 'upgrade',
    plan: quote.to.id,
    fromPlan: quote.from.id,
    upgradeUntil: quote.until,
    months: 0,
    amount: quote.amount,
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
    const created = await createYookassaPayment(
      payment,
      `переход с «${quote.from.name}» на «${quote.to.name}» до ${formatDate(quote.until)}`,
      user.email,
    )
    payment.providerPaymentId = created.id
    payment.confirmationUrl = created.confirmationUrl
  } else {
    payment.confirmationUrl = `/kabinet/podpiska?schet=${payment.id}`
  }

  await store.createPayment(payment)
  return { payment, redirectUrl: payment.confirmationUrl }
}

/**
 * Включает оплаченный старший тариф. Идемпотентно: повторный вызов по тому
 * же платежу ничего не меняет.
 *
 * Между заказом и оплатой подписка могла измениться — продлиться, закончиться
 * или уже повыситься другим платежом. Правило одно: человек получает то, за
 * что заплатил, — тариф не ниже оплаченного как минимум до upgradeUntil.
 */
export async function applyUpgrade(payment: Payment): Promise<Subscription> {
  const store = await getStore()
  const now = new Date()
  const to = getPlan(payment.plan)
  const until = payment.upgradeUntil ?? now.toISOString()
  const current = await store.getActiveSubscription(payment.userId)

  if (current && current.provider !== 'trial') {
    const plan = planRank(current.plan) >= planRank(to.id) ? current.plan : to.id
    const expiresAt = new Date(current.expiresAt).getTime() >= new Date(until).getTime() ? current.expiresAt : until
    // Персональный лимит сессий сохраняем, только если он больше, чем даёт
    // новый тариф: иначе повышение лишило бы человека сессий.
    const override =
      current.concurrentSessions != null && current.concurrentSessions > getPlan(plan).concurrentSessions
        ? current.concurrentSessions
        : null
    const upgraded: Subscription = {
      ...current,
      plan,
      expiresAt,
      concurrentSessions: override,
      provider: payment.provider,
      providerId: payment.providerPaymentId || payment.id,
    }
    await store.saveSubscription(upgraded)
    return upgraded
  }

  // Подписка успела закончиться (или сменилась пробным периодом) — оплаченный
  // срок всё равно выдаём.
  if (current) await store.saveSubscription({ ...current, status: 'canceled' })
  const subscription: Subscription = {
    id: newId('sub'),
    userId: payment.userId,
    plan: to.id,
    status: 'active',
    startedAt: now.toISOString(),
    expiresAt: new Date(until).getTime() > now.getTime() ? until : new Date(now.getTime() + DAY_MS).toISOString(),
    autoRenew: false,
    provider: payment.provider,
    providerId: payment.providerPaymentId || payment.id,
    concurrentSessions: null,
  }
  await store.saveSubscription(subscription)
  return subscription
}
