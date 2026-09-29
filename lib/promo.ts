import { CheckoutError } from './billing-model'
import { getStore } from './store'
import { PLANS_BY_ID, getPlan, isFreePlan, type PlanId } from './plans'
import { formatDate } from './time'
import { promoApplies, promoDiscount, promoLabel, type PromoTerms } from './promo-math'
import type { PromoCode, User } from './types'

/**
 * Промокоды: скидка на один платёж за тариф — картой или по счёту. Доплата
 * при повышении тарифа и автопродление идут по обычной цене. Применение
 * засчитывается, когда платёж оплачен; стопроцентный код включает тариф
 * сразу, без оплаты.
 */

export const normalizeCode = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/

export const termsOf = (promo: PromoCode): PromoTerms => ({
  code: promo.code,
  kind: promo.kind,
  value: promo.value,
  plans: promo.plans,
  months: promo.months,
})

/** Условия словами — для кабинета и админки. */
export function describePromo(promo: PromoCode): string {
  const parts = [promoLabel(promo)]
  parts.push(promo.plans.length ? `на ${promo.plans.map((plan) => `«${getPlan(plan).name}»`).join(', ')}` : 'на любой тариф')
  if (promo.months.length) parts.push(`при оплате на ${promo.months.map((m) => (m === 12 ? 'год' : `${m} мес.`)).join(' или ')}`)
  if (promo.firstPaymentOnly) parts.push('для первой оплаты')
  if (promo.validUntil) parts.push(`до ${formatDate(promo.validUntil)}`)
  return parts.join(', ')
}

/**
 * Проверяет, можно ли этому человеку применить код (без привязки к тарифу).
 * Бросает CheckoutError с понятной причиной.
 */
export async function checkPromo(user: User, rawCode: unknown, now = new Date()): Promise<PromoCode> {
  const code = normalizeCode(rawCode)
  const store = await getStore()
  const promo = CODE_RE.test(code) ? await store.findPromoCode(code) : null
  if (!promo || !promo.active) throw new CheckoutError('Такого промокода нет')
  if (promo.validUntil && new Date(promo.validUntil).getTime() < now.getTime()) {
    throw new CheckoutError('Срок действия промокода закончился')
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) throw new CheckoutError('Промокод больше не действует')
  const paid = (await store.listPaymentsByUser(user.id, 100)).filter((payment) => payment.status === 'succeeded')
  if (paid.some((payment) => payment.promoCode === promo.code)) throw new CheckoutError('Вы уже воспользовались этим промокодом')
  if (promo.firstPaymentOnly && paid.some((payment) => payment.amount > 0)) {
    throw new CheckoutError('Промокод действует только на первую оплату')
  }
  return promo
}

/** Скидка на конкретный заказ; бросает CheckoutError, если код к нему не подходит. */
export async function applyPromo(
  user: User,
  rawCode: unknown,
  plan: PlanId,
  months: number,
  amount: number,
): Promise<{ promo: PromoCode; discount: number }> {
  const promo = await checkPromo(user, rawCode)
  if (!promoApplies(termsOf(promo), plan, months)) {
    throw new CheckoutError(`Промокод ${promo.code} не подходит к этому тарифу или сроку: ${describePromo(promo)}`)
  }
  return { promo, discount: promoDiscount(termsOf(promo), amount) }
}

/** Условия из формы админки. */
export function parsePromoInput(input: Record<string, unknown>, existing: PromoCode | null, adminEmail: string): PromoCode {
  const code = existing?.code ?? normalizeCode(input.code)
  if (!CODE_RE.test(code)) throw new CheckoutError('Код — от 3 до 32 латинских букв, цифр, «-» и «_»')
  const kind = input.kind === 'fixed' ? 'fixed' : 'percent'
  const rawValue = Number.parseFloat(String(input.value ?? '').replace(',', '.'))
  if (!Number.isFinite(rawValue) || rawValue <= 0) throw new CheckoutError('Укажите размер скидки')
  if (kind === 'percent' && rawValue > 100) throw new CheckoutError('Скидка — не больше 100%')
  const value = kind === 'percent' ? Math.round(rawValue) : Math.round(rawValue * 100)

  const list = (key: string) =>
    (Array.isArray(input[key]) ? (input[key] as unknown[]) : String(input[key] ?? '').split(','))
      .map((item) => String(item).trim())
      .filter(Boolean)
  const plans = list('plans').filter((plan): plan is PlanId => plan in PLANS_BY_ID && !isFreePlan(plan) && !getPlan(plan).negotiable)
  const months = [...new Set(list('months').map((item) => Number.parseInt(item, 10)).filter((m) => m >= 1 && m <= 36))]
  const maxUses = Number.parseInt(String(input.maxUses ?? ''), 10)
  const until = String(input.validUntil ?? '').trim()
  // Дата из формы — «до конца этого дня» по Москве.
  const validUntil = until ? new Date(`${until}T23:59:59+03:00`) : null
  if (validUntil && Number.isNaN(validUntil.getTime())) throw new CheckoutError('Неверная дата окончания')

  return {
    code,
    kind,
    value,
    plans,
    months,
    maxUses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : null,
    usedCount: existing?.usedCount ?? 0,
    firstPaymentOnly: input.firstPaymentOnly === true || input.firstPaymentOnly === 'on' || input.firstPaymentOnly === 'true',
    validUntil: validUntil ? validUntil.toISOString() : null,
    active: existing?.active ?? true,
    note: String(input.note ?? '').trim().slice(0, 300),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    createdBy: existing?.createdBy ?? adminEmail,
  }
}
