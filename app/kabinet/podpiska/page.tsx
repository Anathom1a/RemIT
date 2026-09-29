import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckoutButton } from '@/components/cabinet/checkout-button'
import { LimitBanner } from '@/components/cabinet/limit-banner'
import { DataTable } from '@/components/ui/data-table'
import { AutoRenewChoice, DisableAutopayButton } from '@/components/cabinet/autopay'
import { InvoiceForm } from '@/components/cabinet/invoice-form'
import { DOCUMENT_TITLES, documentPath, invoicesAvailable, paymentDocuments } from '@/lib/documents'
import {
  autopayAvailable,
  calculateAmount,
  quoteUpgrade,
  syncPendingPayments,
  type UpgradeQuote,
} from '@/lib/billing'
import { RENEWAL } from '@/lib/billing-jobs'
import { refundedAmount } from '@/lib/billing-model'
import type { Payment } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth'
import { getLimitNotice } from '@/lib/limit-notice'
import { userSubject } from '@/lib/quota'
import { getStore } from '@/lib/store'
import { formatPrice, getPlan, planRank, purchasablePlans, type PlanId } from '@/lib/plans'
import { formatDate, formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Подписка' }
export const dynamic = 'force-dynamic'

const RECEIPT_KIND: Record<string, string> = {
  prepayment: 'предоплата',
  settlement: 'полный расчёт',
  full_payment: 'полный расчёт',
}

/** Чеки платежа: фискальные признаки, по которым чек проверяется в приложении ФНС. */
function ReceiptCell({ payment }: { payment: Payment }) {
  if (payment.status !== 'succeeded' || payment.provider !== 'yookassa' || !config.billing.receipts.enabled) {
    return <span className="text-text-muted">—</span>
  }
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      {payment.receipts.length === 0 && <span className="text-text-muted">формируется</span>}
      {payment.receipts.map((receipt) => (
        <span key={receipt.id}>
          {RECEIPT_KIND[receipt.kind]}:{' '}
          {receipt.status === 'succeeded' ? (
            <span className="font-mono text-text-secondary">
              ФД {receipt.fiscalDocumentNumber} · ФП {receipt.fiscalAttribute}
            </span>
          ) : receipt.status === 'canceled' ? (
            <span className="text-danger">не выдан</span>
          ) : (
            <span className="text-text-muted">формируется</span>
          )}
        </span>
      ))}
      {payment.settlement === 'due' && payment.serviceEndsAt && (
        <span className="text-text-muted">итоговый чек — {formatDate(payment.serviceEndsAt)}</span>
      )}
    </span>
  )
}

function periodLabel(months: number): string {
  return months === 12 ? 'год' : months === 1 ? 'месяц' : `${months} мес.`
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'ожидает оплаты',
  succeeded: 'оплачен',
  canceled: 'отменён',
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const params = await searchParams
  const invoiceId = typeof params.schet === 'string' ? params.schet : ''
  // Сюда ведёт уведомление о нехватке сессий: этот тариф подсвечиваем.
  const suggested = typeof params.upgrade === 'string' ? params.upgrade : ''

  // Если вебхук ЮKassa не дошёл, статусы подтянутся при открытии страницы.
  await syncPendingPayments(user.id)

  const store = await getStore()
  const [subscription, payments, company] = await Promise.all([
    store.getActiveSubscription(user.id),
    store.listPaymentsByUser(user.id, 20),
    store.findCompany(user.id),
  ])
  const invoice = invoiceId ? await store.findPaymentById(invoiceId) : null
  const paidPlans = purchasablePlans()
  const corporate = getPlan('corporate')

  // Оплаченная подписка (не пробный период): на старшие тарифы переходим
  // доплатой за оставшиеся дни, младшие доступны после окончания срока.
  const paidSubscription = subscription && subscription.provider !== 'trial' ? subscription : null
  const quotes = new Map<PlanId, UpgradeQuote>()
  if (paidSubscription) {
    for (const plan of paidPlans) {
      if (planRank(plan.id) <= planRank(paidSubscription.plan)) continue
      try {
        quotes.set(plan.id, await quoteUpgrade(user.id, plan.id))
      } catch {
        // Переход невозможен — у карточки просто не будет кнопки доплаты.
      }
    }
  }

  // По счёту — то же, что картой: при оплаченной подписке только её продление.
  const invoicePlans = invoicesAvailable()
    ? paidPlans.filter((plan) => !paidSubscription || plan.id === paidSubscription.plan)
    : []

  const limitNotice = await getLimitNotice(userSubject(user.id), 24 * 60 * 60 * 1000)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Подписка</h1>
        <p className="mt-1 text-sm text-text-muted">
          {subscription
            ? `${subscription.provider === 'trial' ? 'Пробный период' : 'Тариф'} «${getPlan(subscription.plan).name}» ${
                subscription.provider === 'trial' ? 'действует' : 'активен'
              } до ${formatDate(subscription.expiresAt)}`
            : `Сейчас действует бесплатный тариф: ${Math.round(config.quota.freeSecondsPerDay / 3600)} часа управления в сутки.`}
        </p>
        {subscription?.concurrentSessions != null && (
          <p className="mt-1 text-sm text-text-secondary">
            Согласовано одновременных сессий: {subscription.concurrentSessions}
          </p>
        )}
      </div>

      {paidSubscription && paidSubscription.autoRenew && (
        <div className="card flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0 space-y-1">
            <h2 className="font-semibold">Автопродление включено</h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              {formatDate(
                new Date(new Date(paidSubscription.expiresAt).getTime() - RENEWAL.chargeBeforeMs).toISOString(),
              )}{' '}
              спишем {formatPrice(calculateAmount(paidSubscription.plan, paidSubscription.renewMonths))} с{' '}
              {paidSubscription.paymentMethodTitle || 'сохранённого способа оплаты'} и продлим «
              {getPlan(paidSubscription.plan).name}» ещё на {periodLabel(paidSubscription.renewMonths)}. За 3 дня
              до списания пришлём письмо.
            </p>
            {paidSubscription.renewError && paidSubscription.renewNextAt && (
              <p className="text-sm text-warning">
                Не удалось списать: {paidSubscription.renewError}. Повторим {formatDateTime(paidSubscription.renewNextAt)}.
              </p>
            )}
          </div>
          <DisableAutopayButton />
        </div>
      )}

      {paidSubscription && !paidSubscription.autoRenew && paidSubscription.renewError && (
        <div className="card border-warning/30 p-5 sm:p-6">
          <h2 className="font-semibold text-warning">Автопродление отключено</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {paidSubscription.renewError}. Подписка действует до {formatDate(paidSubscription.expiresAt)} — продлите её
            ниже.
          </p>
        </div>
      )}

      {limitNotice && <LimitBanner notice={limitNotice} canProrate={Boolean(paidSubscription)} />}

      {invoice && invoice.status === 'pending' && invoice.provider === 'invoice' && (
        <div className="card border-warning/30 p-6">
          <h2 className="font-semibold text-warning">Счёт № {invoice.documentNumber} ожидает оплаты</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {formatPrice(invoice.amount)} за тариф «{getPlan(invoice.plan).name}» на {invoice.months} мес. для{' '}
            {invoice.buyer?.name}. Оплатите до{' '}
            {formatDate(new Date(new Date(invoice.createdAt).getTime() + config.billing.invoices.validDays * 86400000))}{' '}
            переводом с расчётного счёта, в назначении платежа укажите номер счёта. Подписка включится, как только
            деньги поступят, — пришлём письмо и акт. Ссылку на счёт мы отправили на почту
            {invoice.buyer?.documentsEmail ? ' и в бухгалтерию' : ''}.
          </p>
          <a
            href={documentPath(invoice, 'schet')}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white"
          >
            Открыть счёт
          </a>
        </div>
      )}

      {invoice && invoice.status === 'pending' && invoice.provider !== 'invoice' && (
        <div className="card border-warning/30 p-6">
          <h2 className="font-semibold text-warning">Счёт на оплату</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Счёт № <span className="font-mono">{invoice.id}</span> на сумму{' '}
            <strong>{formatPrice(invoice.amount)}</strong>{' '}
            {invoice.kind === 'upgrade'
              ? `за переход на тариф «${getPlan(invoice.plan).name}» до ${formatDate(invoice.upgradeUntil ?? invoice.createdAt)}.`
              : `за тариф «${getPlan(invoice.plan).name}» на ${invoice.months} мес.`}{' '}
            {invoice.provider === 'yookassa' ? (
              <>
                Оплата ещё не подтверждена. Если вы уже оплатили, обновите страницу через минуту —
                статус подтянется из ЮKassa автоматически.
              </>
            ) : (
              <>
                <a href={config.brand.supportUrl} className="text-brand-400 underline decoration-dotted">
                  Отправьте номер счёта в поддержку
                </a>
                . Подписка включится сразу после подтверждения оплаты.
              </>
            )}
          </p>
        </div>
      )}

      {!subscription && (
        <div className="card border-brand-500/30 p-5 sm:p-6">
          <h2 className="font-semibold">Пробный период для компаний</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Организациям открываем полный тариф до {config.trial.maxDays} дней бесплатно. Кнопки
            самостоятельной активации нет: оставьте заявку — менеджер откроет доступ на этот аккаунт,
            обычно в тот же рабочий день.
          </p>
          <a
            href="/probnyy-period"
            className="mt-4 inline-block rounded-xl border border-white/12 bg-ink-800/70 px-5 py-2.5 text-sm text-text-primary hover:border-white/25"
          >
            Оставить заявку
          </a>
        </div>
      )}

      <PlanChoice autopay={autopayAvailable() && !paidSubscription?.autoRenew}>
        <div className="grid gap-5 md:grid-cols-3">
          {paidPlans.map((plan) => {
            const isCurrent = paidSubscription?.plan === plan.id
            const quote = quotes.get(plan.id)
            const isLower = paidSubscription && !isCurrent && planRank(plan.id) < planRank(paidSubscription.plan)
            const isSuggested = suggested === plan.id
            const accent = isSuggested || (!suggested && plan.highlighted)

            return (
              <div
                key={plan.id}
                id={`plan-${plan.id}`}
                className={`card flex scroll-mt-24 flex-col p-6 ${accent ? 'border-brand-500/60' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  {isCurrent && <span className="pill !py-0.5 !text-[11px]">ваш тариф</span>}
                  {isSuggested && !isCurrent && <span className="pill !py-0.5 !text-[11px]">рекомендуем</span>}
                </div>
                <p className="mt-1 text-sm text-text-muted">{plan.tagline}</p>
                <p className="mt-4 text-2xl font-semibold">{formatPrice(plan.priceMonthly)}</p>
                <p className="text-sm text-text-muted">в месяц · {formatPrice(plan.priceYearly)} за год</p>

                <ul className="mt-5 flex-1 space-y-2 text-sm text-text-secondary">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>

                <div className="mt-6 space-y-2">
                  {quote ? (
                    <>
                      <CheckoutButton
                        plan={plan.id}
                        upgrade
                        label={`Перейти сейчас — доплата ${formatPrice(quote.amount)}`}
                        variant={accent ? 'primary' : 'secondary'}
                      />
                      <p className="text-xs leading-relaxed text-text-muted">
                        Тариф «{plan.name}» включится сразу и будет действовать до {formatDate(quote.until)} —
                        платите только разницу за {quote.remainingDays} дн.
                        {quote.basis === 'year' ? ' Считаем по годовым ценам, как вы покупали.' : ''} Одновременных
                        сессий станет {plan.concurrentSessions}.
                        {paidSubscription?.autoRenew
                          ? ` Автопродление сохранится — дальше по цене «${plan.name}».`
                          : ''}
                      </p>
                    </>
                  ) : isLower ? (
                    <p className="rounded-xl border border-white/8 bg-ink-850/50 p-3 text-xs leading-relaxed text-text-muted">
                      Перейти на этот тариф можно после окончания текущей подписки —{' '}
                      {formatDate(paidSubscription.expiresAt)}.
                    </p>
                  ) : (
                    <>
                      <CheckoutButton
                        plan={plan.id}
                        months={1}
                        label={`${isCurrent ? 'Продлить на месяц' : 'Оплатить месяц'} — ${formatPrice(plan.priceMonthly)}`}
                        variant={accent && !isCurrent ? 'primary' : 'secondary'}
                      />
                      <CheckoutButton
                        plan={plan.id}
                        months={12}
                        label={`${isCurrent ? 'Продлить на год' : 'Год'} — ${formatPrice(plan.priceYearly)}`}
                        variant="secondary"
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </PlanChoice>

      {invoicesAvailable() && (
        <div id="po-schetu" className="card scroll-mt-24 p-5 sm:p-6">
          <h2 className="font-semibold">Оплата по счёту для организаций</h2>
          {!company ? (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Выставим счёт на организацию или ИП, после оплаты — акт. Сначала{' '}
              <a href="/kabinet/profil#rekvizity" className="text-brand-400 hover:text-brand-300">
                заполните реквизиты в профиле
              </a>
              .
            </p>
          ) : invoicePlans.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Продление по счёту для вашего тарифа выставляет отдел продаж — напишите на {config.brand.salesEmail}.
            </p>
          ) : (
            <>
              <p className="mt-2 mb-4 text-sm leading-relaxed text-text-secondary">
                Счёт на {company.name}, ИНН {company.inn}. Подписка включится после поступления оплаты на наш
                расчётный счёт, акт появится здесь же. Чек по 54-ФЗ при оплате с расчётного счёта не выдаётся.
              </p>
              <InvoiceForm
                plans={invoicePlans.map((plan) => ({
                  id: plan.id,
                  name: plan.name,
                  priceMonthly: formatPrice(plan.priceMonthly),
                  priceYearly: formatPrice(plan.priceYearly),
                }))}
                defaultPlan={paidSubscription?.plan}
              />
            </>
          )}
        </div>
      )}

      <div id="corporate" className="card grid scroll-mt-24 gap-6 p-6 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{corporate.name}</h2>
            <span className="pill !py-0.5 !text-[11px]">цена договорная</span>
          </div>
          <p className="mt-2 text-sm text-text-secondary">{corporate.tagline}</p>
          <ul className="mt-4 space-y-2 text-sm text-text-secondary">
            {corporate.features.slice(0, 4).map((feature) => (
              <li key={feature}>• {feature}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-5">
          <p className="text-sm leading-relaxed text-text-secondary">
            Нужно больше одновременных сессий, чем даёт «{getPlan('business').name}»? Напишите — согласуем
            число сессий и выставим счёт.
          </p>
          <a
            href={`mailto:${config.brand.salesEmail}?subject=${encodeURIComponent('Корпоративный тариф RemIT')}`}
            className="mt-4 block rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-center text-sm font-medium text-white"
          >
            Запросить счёт
          </a>
          <a
            href={config.brand.supportUrl}
            className="mt-2 block rounded-xl border border-white/12 bg-ink-800/70 px-5 py-2.5 text-center text-sm text-text-primary"
          >
            Написать в поддержку
          </a>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">История платежей</h2>
        </div>
        <DataTable
          rows={payments}
          getKey={(payment) => payment.id}
          minWidth={960}
          empty="Платежей пока не было."
          columns={[
            { key: 'date', header: 'Дата', primary: true, render: (payment) => formatDateTime(payment.createdAt) },
            {
              key: 'plan',
              header: 'Тариф',
              render: (payment) =>
                payment.kind === 'upgrade' && payment.fromPlan
                  ? `${getPlan(payment.fromPlan).name} → ${getPlan(payment.plan).name}`
                  : getPlan(payment.plan).name,
            },
            {
              key: 'months',
              header: 'Период',
              render: (payment) =>
                payment.kind === 'upgrade'
                  ? `повышение до ${formatDate(payment.upgradeUntil ?? payment.createdAt)}`
                  : `${payment.months} мес.`,
            },
            {
              key: 'amount',
              header: 'Сумма',
              render: (payment) => <span className="tabular-nums">{formatPrice(payment.amount)}</span>,
            },
            {
              key: 'status',
              header: 'Статус',
              render: (payment) => {
                const refunded = refundedAmount(payment)
                return `${STATUS_LABELS[payment.status] ?? payment.status}${payment.recurring ? ' · автопродление' : ''}${
                  refunded > 0 ? ` · возвращено ${formatPrice(refunded)}` : ''
                }`
              },
            },
            { key: 'receipt', header: 'Чек', render: (payment) => <ReceiptCell payment={payment} /> },
            {
              key: 'documents',
              header: 'Документы',
              render: (payment) => {
                const kinds = paymentDocuments(payment)
                if (kinds.length === 0) return <span className="text-text-muted">—</span>
                return (
                  <span className="flex flex-col gap-0.5 text-xs">
                    {kinds.map((kind) => (
                      <a
                        key={kind}
                        href={documentPath(payment, kind)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-400 hover:text-brand-300"
                      >
                        {DOCUMENT_TITLES[kind]} № {payment.documentNumber}
                      </a>
                    ))}
                  </span>
                )
              },
            },
          ]}
        />
      </div>
    </div>
  )
}

/** Отметка автопродления над тарифами — только если ЮKassa его поддерживает. */
function PlanChoice({ autopay, children }: { autopay: boolean; children: React.ReactNode }) {
  return autopay ? <AutoRenewChoice>{children}</AutoRenewChoice> : <>{children}</>
}
