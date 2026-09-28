import { createHash } from 'node:crypto'
import { config } from './config'
import { AUTOPAY_OFF, paymentExtras } from './billing-model'
import { calculateAmount, markPaymentPaid, paymentDescription, sendPaymentToYookassa } from './billing'
import { sendRenewalFailed, sendRenewalNotice, sendRenewalSucceeded } from './billing-mail'
import { getPlan, isFreePlan } from './plans'
import { getStore } from './store'
import {
  YookassaError,
  createSettlementReceipt,
  getPayment,
  listReceipts,
  yookassaConfigured,
  type YookassaPayment,
} from './yookassa'
import type { Payment, PaymentReceipt, Subscription, User } from './types'

/**
 * Фоновые задачи оплаты. Запускаются попутно с heartbeat (не чаще раза в
 * десять минут), кнопкой в админке или внешним cron через
 * POST /api/v1/billing/jobs с сервисным токеном.
 *
 *   1. Предупреждение за 3 дня до автосписания.
 *   2. Автосписание за сутки до конца подписки; при отказе банка — ещё две
 *      попытки через 12 часов. Если способ оплаты больше не годится (карта
 *      истекла, человек отозвал разрешение) — автопродление выключается.
 *   3. Второй чек «полный расчёт» по окончании оплаченного периода (54-ФЗ,
 *      если первый чек был «предоплата 100%»).
 *   4. Фискальные данные чеков из ЮKassa — для кабинета и админки.
 *
 * Двойного списания не будет: у каждой попытки свой ключ идемпотентности и
 * свой id платежа, выведенные из подписки, даты окончания и номера попытки.
 * Параллельный запуск (два процесса) упрётся в уникальный id, а ЮKassa по
 * тому же ключу вернёт тот же платёж.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export const RENEWAL = {
  /** Предупреждаем за столько до окончания подписки. */
  noticeBeforeMs: 4 * DAY,
  /** Списываем за столько до окончания. */
  chargeBeforeMs: DAY,
  /** Пауза между попытками. */
  retryMs: 12 * HOUR,
  maxAttempts: 3,
  /** Сервер лежал в момент продления — догоняем, если прошло не больше. */
  graceMs: 3 * DAY,
}

/** Причины отказа, после которых повторять бессмысленно. */
const PERMANENT_REASONS = new Set([
  'permission_revoked',
  'card_expired',
  'payment_method_restricted',
  'invalid_card_number',
  'invalid_csc',
  'country_forbidden',
  'fraud_suspected',
  '3d_secure_failed',
])

const REASON_TEXT: Record<string, string> = {
  insufficient_funds: 'на карте недостаточно средств',
  card_expired: 'истёк срок действия карты',
  permission_revoked: 'разрешение на автоматические списания отозвано',
  payment_method_restricted: 'банк ограничил операции по карте',
  payment_method_limit_exceeded: 'превышен лимит операций по карте',
  invalid_card_number: 'карта недействительна',
  invalid_csc: 'карта недействительна',
  issuer_unavailable: 'банк не ответил',
  call_issuer: 'банк отклонил платёж',
  general_decline: 'банк отклонил платёж',
  fraud_suspected: 'банк заподозрил мошенничество и отклонил платёж',
  country_forbidden: 'банк не разрешает такие платежи',
  '3d_secure_failed': 'банк требует подтверждения платежа',
  internal_timeout: 'платёжная система не ответила вовремя',
}

export const failureText = (reason: string) => REASON_TEXT[reason] ?? 'платёж отклонён'

export interface BillingJobReport {
  notices: number
  charged: number
  failed: number
  pending: number
  settlements: number
  receipts: number
  errors: string[]
}

const emptyReport = (): BillingJobReport => ({
  notices: 0,
  charged: 0,
  failed: 0,
  pending: 0,
  settlements: 0,
  receipts: 0,
  errors: [],
})

let running: Promise<BillingJobReport> | null = null
let lastRunAt = 0
let lastReport: { at: string; report: BillingJobReport } | null = null

export const lastBillingJobs = () => lastReport

/** Попутный запуск: не чаще раза в десять минут на процесс. */
export async function maybeRunBillingJobs(): Promise<void> {
  if (Date.now() - lastRunAt < 10 * 60 * 1000) return
  await runBillingJobs()
}

export async function runBillingJobs(now = new Date()): Promise<BillingJobReport> {
  if (running) return running
  lastRunAt = Date.now()
  running = (async () => {
    const report = emptyReport()
    if (config.billing.provider !== 'yookassa' || !yookassaConfigured()) return report
    const step = async (name: string, job: () => Promise<void>) => {
      try {
        await job()
      } catch (error) {
        report.errors.push(`${name}: ${(error as Error).message}`)
        console.error(`[billing] ${name}:`, error)
      }
    }
    if (config.billing.autopay) {
      await step('предупреждения', () => sendNotices(now, report))
      await step('автосписания', () => chargeDue(now, report))
    }
    if (config.billing.receipts.enabled) {
      if (config.billing.receipts.mode === 'prepayment') {
        await step('вторые чеки', () => issueSettlements(now, report))
      }
      await step('фискальные данные', () => syncReceipts(now, report))
    }
    lastReport = { at: now.toISOString(), report }
    return report
  })()
  try {
    return await running
  } finally {
    running = null
  }
}

/* ---------------------------------------------------------------- 1 ---- */

async function sendNotices(now: Date, report: BillingJobReport) {
  const store = await getStore()
  const from = new Date(now.getTime() + RENEWAL.chargeBeforeMs)
  const until = new Date(now.getTime() + RENEWAL.noticeBeforeMs)
  for (const subscription of await store.listRenewalCandidates(from.toISOString(), until.toISOString())) {
    if (!subscription.paymentMethodId || subscription.renewNoticeFor === subscription.expiresAt) continue
    const user = await store.findUserById(subscription.userId)
    if (!user || user.status !== 'active') continue
    const amount = calculateAmount(subscription.plan, subscription.renewMonths)
    const chargeAt = new Date(new Date(subscription.expiresAt).getTime() - RENEWAL.chargeBeforeMs)
    await sendRenewalNotice(user, subscription, amount, chargeAt)
    // Отмечаем и без почтового сервера: иначе при его появлении пришла бы пачка писем.
    await store.saveSubscription({ ...subscription, renewNoticeFor: subscription.expiresAt })
    report.notices += 1
  }
}

/* ---------------------------------------------------------------- 2 ---- */

async function chargeDue(now: Date, report: BillingJobReport) {
  const store = await getStore()
  const from = new Date(now.getTime() - RENEWAL.graceMs)
  const until = new Date(now.getTime() + RENEWAL.chargeBeforeMs)
  for (const subscription of await store.listRenewalCandidates(from.toISOString(), until.toISOString())) {
    if (subscription.renewNextAt && new Date(subscription.renewNextAt).getTime() > now.getTime()) continue
    try {
      await renewOne(subscription, now, report)
    } catch (error) {
      // Сеть или 5xx ЮKassa: попробуем при следующем запуске тем же ключом.
      report.errors.push(`продление ${subscription.id}: ${(error as Error).message}`)
      console.error(`[billing] продление ${subscription.id}:`, error)
    }
  }
}

async function stopAutopay(subscription: Subscription, reason: string) {
  const store = await getStore()
  await store.saveSubscription({ ...subscription, ...AUTOPAY_OFF, renewError: reason })
}

async function renewOne(subscription: Subscription, now: Date, report: BillingJobReport) {
  const store = await getStore()
  const plan = getPlan(subscription.plan)
  if (!subscription.paymentMethodId || subscription.provider === 'trial' || plan.negotiable || isFreePlan(plan.id)) {
    await stopAutopay(subscription, 'тариф не продлевается автоматически')
    return
  }
  const user = await store.findUserById(subscription.userId)
  if (!user || user.status === 'deleted') {
    await stopAutopay(subscription, 'аккаунт удалён')
    return
  }
  // Заблокированному не списываем, но и согласие не отзываем: блокировку могут снять.
  if (user.status !== 'active') return

  // Подписку уже заменила другая (купили тариф заново после окончания) —
  // эту больше не продлеваем.
  const active = await store.getActiveSubscription(user.id)
  if (active && active.id !== subscription.id) {
    await stopAutopay(subscription, '')
    return
  }

  const attempt = subscription.renewAttempts + 1
  const key = `renew-${subscription.id}-${new Date(subscription.expiresAt).getTime()}-${attempt}`
  const id = `pay_r${createHash('sha256').update(key).digest('hex').slice(0, 24)}`

  let payment = await store.findPaymentById(id)
  if (!payment) {
    const months = subscription.renewMonths > 0 ? subscription.renewMonths : 1
    const fresh: Payment = {
      ...paymentExtras(),
      id,
      userId: user.id,
      kind: 'subscription',
      plan: subscription.plan,
      fromPlan: null,
      upgradeUntil: null,
      months,
      amount: calculateAmount(subscription.plan, months),
      status: 'pending',
      provider: 'yookassa',
      providerPaymentId: '',
      confirmationUrl: '',
      createdAt: now.toISOString(),
      paidAt: null,
      recurring: true,
      subscriptionId: subscription.id,
      idempotenceKey: key,
      receiptEmail: user.email,
    }
    // Тот же id уже создаёт соседний процесс — пусть он и доводит.
    if (!(await store.createPaymentIfAbsent(fresh))) return
    payment = fresh
  }

  if (payment.status === 'succeeded') return
  if (payment.status === 'canceled') {
    await onFailure(subscription, user, payment.failureReason, now, report)
    return
  }

  let remote: YookassaPayment
  try {
    remote = payment.providerPaymentId
      ? await getPayment(payment.providerPaymentId)
      : await sendPaymentToYookassa(payment, subscription.paymentMethodId)
  } catch (error) {
    if (error instanceof YookassaError && error.permanent && !payment.providerPaymentId) {
      // Запрос отклонён целиком (способ оплаты удалён, автоплатежи выключены у
      // магазина) — повтор не поможет.
      await store.savePayment({ ...payment, status: 'canceled', failureReason: error.code })
      await onFailure(subscription, user, 'permission_revoked', now, report)
      return
    }
    throw error
  }

  if (!payment.providerPaymentId) {
    payment = { ...payment, providerPaymentId: remote.id }
    await store.savePayment(payment)
  }

  if (remote.status === 'succeeded') {
    const renewed = await markPaymentPaid(payment, remote)
    if (renewed) await sendRenewalSucceeded(user, renewed, payment.amount)
    report.charged += 1
  } else if (remote.status === 'canceled') {
    await store.savePayment({ ...payment, status: 'canceled', failureReason: remote.cancellationReason })
    await onFailure(subscription, user, remote.cancellationReason, now, report)
  } else {
    report.pending += 1
  }
}

async function onFailure(subscription: Subscription, user: User, reason: string, now: Date, report: BillingJobReport) {
  const store = await getStore()
  report.failed += 1
  const attempts = subscription.renewAttempts + 1
  const text = failureText(reason)
  const nextAt = new Date(now.getTime() + RENEWAL.retryMs)
  const giveUp =
    PERMANENT_REASONS.has(reason) ||
    attempts >= RENEWAL.maxAttempts ||
    nextAt.getTime() > new Date(subscription.expiresAt).getTime() + RENEWAL.graceMs

  if (giveUp) {
    const stopped: Subscription = { ...subscription, ...AUTOPAY_OFF, renewError: text }
    await store.saveSubscription(stopped)
    await sendRenewalFailed(user, stopped, text, null)
    return
  }
  const next: Subscription = {
    ...subscription,
    renewAttempts: attempts,
    renewNextAt: nextAt.toISOString(),
    renewError: text,
  }
  await store.saveSubscription(next)
  await sendRenewalFailed(user, next, text, nextAt)
}

/* ---------------------------------------------------------------- 3 ---- */

async function issueSettlements(now: Date, report: BillingJobReport) {
  const store = await getStore()
  for (const payment of await store.listPaymentsDueSettlement(now.toISOString(), 20)) {
    if (payment.provider !== 'yookassa' || !payment.providerPaymentId) {
      await store.savePayment({ ...payment, settlement: 'skipped' })
      continue
    }
    try {
      const remote = await getPayment(payment.providerPaymentId)
      const amount = payment.amount - remote.refundedAmount
      if (amount <= 0) {
        // Деньги вернули — услуга не оказана, зачитывать нечего.
        await store.savePayment({ ...payment, settlement: 'skipped' })
        continue
      }
      const email = payment.receiptEmail || (await store.findUserById(payment.userId))?.email || ''
      if (!email || email.endsWith('.invalid')) {
        await store.savePayment({ ...payment, settlement: 'skipped' })
        console.warn(`[billing] второй чек по ${payment.id} не выдан: нет почты покупателя`)
        continue
      }
      const receipt = await createSettlementReceipt({
        paymentId: payment.providerPaymentId,
        email,
        description: paymentDescription(payment),
        amount,
        idempotenceKey: `settle-${payment.id}`,
      })
      await store.savePayment({ ...payment, settlement: 'sent', receipts: mergeReceipts(payment.receipts, [receipt]) })
      report.settlements += 1
    } catch (error) {
      report.errors.push(`второй чек ${payment.id}: ${(error as Error).message}`)
    }
  }
}

/* ---------------------------------------------------------------- 4 ---- */

function mergeReceipts(current: PaymentReceipt[], fresh: PaymentReceipt[]): PaymentReceipt[] {
  const byId = new Map(current.map((receipt) => [receipt.id, receipt]))
  for (const receipt of fresh) byId.set(receipt.id, receipt)
  return [...byId.values()]
}

async function syncReceipts(now: Date, report: BillingJobReport) {
  const store = await getStore()
  const since = new Date(now.getTime() - 14 * DAY).toISOString()
  for (const payment of await store.listPaymentsAwaitingReceipt(since, 20)) {
    if (!payment.providerPaymentId) continue
    try {
      const receipts = await listReceipts(payment.providerPaymentId)
      if (receipts.length === 0) continue
      const merged = mergeReceipts(payment.receipts, receipts)
      if (JSON.stringify(merged) === JSON.stringify(payment.receipts)) continue
      // Статус и прочее перечитываем: платёж мог измениться, пока ходили в ЮKassa.
      const latest = (await store.findPaymentById(payment.id)) ?? payment
      await store.savePayment({ ...latest, receipts: mergeReceipts(latest.receipts, receipts) })
      report.receipts += 1
    } catch (error) {
      report.errors.push(`чеки ${payment.id}: ${(error as Error).message}`)
    }
  }
}
