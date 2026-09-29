import { config } from './config'
import { escapeHtml, sendMail } from './mail'
import { formatPrice, getPlan } from './plans'
import { formatDate } from './time'
import { documentUrl } from './documents'
import type { Payment, Subscription, User } from './types'

/**
 * Письма об автопродлении. Предупреждение перед списанием обязательно:
 * человек должен знать, сколько и когда спишут, и где это отключить.
 */

const cabinetUrl = () => `${config.rustdesk.apiServer.replace(/\/+$/, '')}/kabinet/podpiska`

function period(months: number): string {
  if (months === 12) return 'год'
  if (months === 1) return 'месяц'
  return `${months} мес.`
}

function layout(user: User, paragraphs: string[], button?: { label: string; url: string }): { text: string; html: string } {
  const brand = config.brand.name
  const greeting = `Здравствуйте${user.name ? `, ${user.name}` : ''}!`
  const text = [
    greeting,
    '',
    ...paragraphs.flatMap((line) => [line, '']),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    `— ${brand}, ${config.brand.domain}`,
  ].join('\n')
  const html = `<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;color:#1a1d21;line-height:1.5">
<p>${escapeHtml(greeting)}</p>
${paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')}
${
  button
    ? `<p><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:10px 18px;background:#3457D5;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(button.label)}</a></p>`
    : ''
}
<p style="color:#5b6470;font-size:13px">— ${escapeHtml(brand)}, ${escapeHtml(config.brand.domain)}</p>
</body></html>`
  return { text, html }
}

/** За несколько дней до списания. */
export async function sendRenewalNotice(user: User, subscription: Subscription, amount: number, chargeAt: Date) {
  const plan = getPlan(subscription.plan)
  const body = layout(
    user,
    [
      `${formatDate(chargeAt.toISOString())} мы продлим подписку ${config.brand.name} на тариф «${plan.name}» ещё на ${period(subscription.renewMonths)} и спишем ${formatPrice(amount)} с ${subscription.paymentMethodTitle || 'сохранённого способа оплаты'}.`,
      `Подписка оплачена до ${formatDate(subscription.expiresAt)}. Если продлевать не нужно, отключите автопродление в кабинете — оплаченный срок сохранится.`,
      'Чек придёт на эту почту после списания.',
    ],
    { label: 'Управлять подпиской', url: cabinetUrl() },
  )
  return sendMail({ to: user.email, subject: `${config.brand.name}: скоро продлим подписку`, ...body })
}

export async function sendRenewalSucceeded(user: User, subscription: Subscription, amount: number) {
  const plan = getPlan(subscription.plan)
  const body = layout(
    user,
    [
      `Подписка ${config.brand.name} на тариф «${plan.name}» продлена до ${formatDate(subscription.expiresAt)}. Списано ${formatPrice(amount)} с ${subscription.paymentMethodTitle || 'сохранённого способа оплаты'}.`,
      'Кассовый чек придёт отдельным письмом. Отключить автопродление можно в кабинете.',
    ],
    { label: 'Открыть кабинет', url: cabinetUrl() },
  )
  return sendMail({ to: user.email, subject: `${config.brand.name}: подписка продлена`, ...body })
}

/** Неудачное списание: nextAttempt — когда попробуем снова; null — больше не пробуем. */
export async function sendRenewalFailed(
  user: User,
  subscription: Subscription,
  reason: string,
  nextAttempt: Date | null,
) {
  const lines = [
    `Не удалось продлить подписку ${config.brand.name}: ${reason}.`,
    nextAttempt
      ? `Попробуем списать ещё раз ${formatDate(nextAttempt.toISOString())}. Подписка действует до ${formatDate(subscription.expiresAt)}.`
      : `Автопродление отключено. Подписка действует до ${formatDate(subscription.expiresAt)} — продлите её в кабинете, чтобы не перейти на бесплатный тариф.`,
  ]
  const body = layout(user, lines, { label: 'Продлить подписку', url: cabinetUrl() })
  return sendMail({ to: user.email, subject: `${config.brand.name}: не удалось продлить подписку`, ...body })
}

/** Возврат оформлен. */
export async function sendRefundNotice(
  user: User,
  payment: { amount: number; plan: Subscription['plan'] },
  refund: { amount: number; status: string; providerRefundId: string },
  canceled: boolean,
) {
  const plan = getPlan(payment.plan)
  const lines = [
    `Оформили возврат ${formatPrice(refund.amount)} за подписку ${config.brand.name} «${plan.name}».`,
    refund.providerRefundId
      ? 'Деньги вернутся тем же способом, которым вы платили: на карту — обычно за несколько дней, срок зависит от банка. Чек возврата придёт отдельным письмом.'
      : 'Деньги вернём переводом на реквизиты, с которых пришла оплата.',
    canceled ? 'Подписка отключена, аккаунт перешёл на бесплатный тариф.' : 'Подписка продолжает действовать.',
  ]
  const body = layout(user, lines, { label: 'Открыть кабинет', url: cabinetUrl() })
  return sendMail({ to: user.email, subject: `${config.brand.name}: возврат оформлен`, ...body })
}

/** Кому слать документы: владелец аккаунта и бухгалтерия, если указана. */
function documentRecipients(user: User, payment: Payment): string {
  return [...new Set([user.email, payment.buyer?.documentsEmail].filter(Boolean))].join(', ')
}

/** Счёт выставлен: ссылка на счёт и срок оплаты. */
export async function sendInvoiceIssued(user: User, payment: Payment) {
  const plan = getPlan(payment.plan)
  const due = new Date(new Date(payment.createdAt).getTime() + config.billing.invoices.validDays * 24 * 60 * 60 * 1000)
  const body = layout(
    user,
    [
      `Выставили счёт № ${payment.documentNumber} на ${formatPrice(payment.amount)} для ${payment.buyer?.name ?? 'организации'}: подписка ${config.brand.name} «${plan.name}» на ${payment.months} мес.`,
      `Оплатите его до ${formatDate(due.toISOString())} переводом с расчётного счёта организации; в назначении платежа укажите номер счёта. Подписка включится, как только деньги поступят, — пришлём письмо и акт.`,
    ],
    { label: 'Открыть счёт', url: documentUrl(payment, 'schet') },
  )
  return sendMail({ to: documentRecipients(user, payment), subject: `${config.brand.name}: счёт № ${payment.documentNumber}`, ...body })
}

/** Оплата по счёту получена: подписка включена, акт готов. */
export async function sendInvoicePaid(user: User, payment: Payment, subscription: Subscription) {
  const plan = getPlan(payment.plan)
  const body = layout(
    user,
    [
      `Получили оплату по счёту № ${payment.documentNumber} — ${formatPrice(payment.amount)}. Подписка ${config.brand.name} «${plan.name}» действует до ${formatDate(subscription.expiresAt)}.`,
      `Акт № ${payment.documentNumber}: ${documentUrl(payment, 'akt')}`,
      'Счёт и акт всегда можно открыть в кабинете, в разделе «Подписка».',
    ],
    { label: 'Открыть кабинет', url: cabinetUrl() },
  )
  return sendMail({ to: documentRecipients(user, payment), subject: `${config.brand.name}: оплата получена, акт № ${payment.documentNumber}`, ...body })
}
