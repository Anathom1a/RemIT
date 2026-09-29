/**
 * Расчёт скидки по промокоду. Без серверных зависимостей: тем же кодом
 * кабинет показывает цену со скидкой, а сервер считает платёж.
 */

export interface PromoTerms {
  code: string
  kind: 'percent' | 'fixed'
  value: number
  plans: string[]
  months: number[]
}

/** Подходит ли промокод к тарифу и сроку. */
export function promoApplies(terms: PromoTerms, plan: string, months: number): boolean {
  return (terms.plans.length === 0 || terms.plans.includes(plan)) && (terms.months.length === 0 || terms.months.includes(months))
}

/**
 * Скидка в копейках. Процент — с округлением вниз до рубля. Итог либо ноль
 * (бесплатно, без оплаты), либо не меньше рубля: ЮKassa не принимает меньше.
 */
export function promoDiscount(terms: PromoTerms, amount: number): number {
  let discount =
    terms.kind === 'percent'
      ? Math.floor((amount * Math.min(100, terms.value)) / 100 / 100) * 100
      : Math.min(terms.value, amount)
  if (terms.kind === 'percent' && terms.value >= 100) discount = amount
  const rest = amount - discount
  if (rest > 0 && rest < 100) discount = amount - 100
  return Math.max(0, discount)
}

/** «−20%» или «−500 ₽». */
export function promoLabel(terms: Pick<PromoTerms, 'kind' | 'value'>): string {
  return terms.kind === 'percent'
    ? `−${terms.value}%`
    : `−${new Intl.NumberFormat('ru-RU').format(Math.round(terms.value / 100))} ₽`
}
