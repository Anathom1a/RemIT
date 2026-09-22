import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckoutButton } from '@/components/cabinet/checkout-button'
import { DataTable } from '@/components/ui/data-table'
import { syncPendingPayments } from '@/lib/billing'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'
import { PLANS, formatPrice, getPlan, purchasablePlans } from '@/lib/plans'
import { formatDate, formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Подписка' }
export const dynamic = 'force-dynamic'

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

  // Если вебхук ЮKassa не дошёл, статусы подтянутся при открытии страницы.
  await syncPendingPayments(user.id)

  const store = await getStore()
  const [subscription, payments] = await Promise.all([
    store.getActiveSubscription(user.id),
    store.listPaymentsByUser(user.id, 20),
  ])
  const invoice = invoiceId ? await store.findPaymentById(invoiceId) : null
  const paidPlans = purchasablePlans()
  const corporate = getPlan('corporate')

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

      {invoice && invoice.status === 'pending' && (
        <div className="card border-warning/30 p-6">
          <h2 className="font-semibold text-warning">Счёт на оплату</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Счёт № <span className="font-mono">{invoice.id}</span> на сумму{' '}
            <strong>{formatPrice(invoice.amount)}</strong> за тариф «{getPlan(invoice.plan).name}» на{' '}
            {invoice.months} мес.{' '}
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

      <div className="grid gap-5 md:grid-cols-3">
        {paidPlans.map((plan) => (
          <div
            key={plan.id}
            className={`card flex flex-col p-6 ${plan.highlighted ? 'border-brand-500/60' : ''}`}
          >
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="mt-1 text-sm text-text-muted">{plan.tagline}</p>
            <p className="mt-4 text-2xl font-semibold">{formatPrice(plan.priceMonthly)}</p>
            <p className="text-sm text-text-muted">в месяц · {formatPrice(plan.priceYearly)} за год</p>

            <ul className="mt-5 flex-1 space-y-2 text-sm text-text-secondary">
              {plan.features.slice(0, 4).map((feature) => (
                <li key={feature}>• {feature}</li>
              ))}
            </ul>

            <div className="mt-6 space-y-2">
              <CheckoutButton
                plan={plan.id}
                months={1}
                label={`Оплатить месяц — ${formatPrice(plan.priceMonthly)}`}
                variant={plan.highlighted ? 'primary' : 'secondary'}
              />
              <CheckoutButton
                plan={plan.id}
                months={12}
                label={`Год — ${formatPrice(plan.priceYearly)}`}
                variant="secondary"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="card grid gap-6 p-6 md:grid-cols-[1.4fr_1fr] md:items-center">
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
          minWidth={640}
          empty="Платежей пока не было."
          columns={[
            { key: 'date', header: 'Дата', primary: true, render: (payment) => formatDateTime(payment.createdAt) },
            { key: 'plan', header: 'Тариф', render: (payment) => getPlan(payment.plan).name },
            { key: 'months', header: 'Период', render: (payment) => `${payment.months} мес.` },
            {
              key: 'amount',
              header: 'Сумма',
              render: (payment) => <span className="tabular-nums">{formatPrice(payment.amount)}</span>,
            },
            {
              key: 'status',
              header: 'Статус',
              render: (payment) => STATUS_LABELS[payment.status] ?? payment.status,
            },
          ]}
        />
      </div>
    </div>
  )
}
