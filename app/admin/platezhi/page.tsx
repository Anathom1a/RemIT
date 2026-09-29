import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { DataTable } from '@/components/ui/data-table'
import { getStore } from '@/lib/store'
import { formatPrice, getPlan } from '@/lib/plans'
import { formatDate, formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'
import { failureText, lastBillingJobs } from '@/lib/billing-jobs'
import { refundedAmount } from '@/lib/billing-model'
import { RefundForm } from '@/components/admin/refund-form'
import type { Payment } from '@/lib/types'

/** Чеки платежа коротко: сколько выдано и ждёт ли второй чек. */
function receiptSummary(payment: Payment): string {
  if (payment.status !== 'succeeded' || payment.provider !== 'yookassa') return '—'
  const done = payment.receipts.filter((receipt) => receipt.status === 'succeeded')
  const parts = [done.length ? done.map((receipt) => `ФД ${receipt.fiscalDocumentNumber}`).join(', ') : 'ждём ЮKassa']
  if (payment.settlement === 'due' && payment.serviceEndsAt) parts.push(`второй — ${formatDate(payment.serviceEndsAt)}`)
  if (payment.settlement === 'skipped') parts.push('второй не нужен')
  if (payment.receipts.some((receipt) => receipt.status === 'canceled')) parts.push('есть отклонённый')
  return parts.join(' · ')
}

export const metadata: Metadata = { title: 'Платежи и подписки' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'ожидает оплаты', className: 'text-warning' },
  succeeded: { label: 'оплачен', className: 'text-success' },
  canceled: { label: 'отменён', className: 'text-text-muted' },
}

export default async function AdminPaymentsPage() {
  const store = await getStore()
  const [payments, subscriptions] = await Promise.all([
    store.listRecentPayments(50),
    store.listActiveSubscriptions(),
  ])

  const emails = new Map<string, string>()
  for (const id of new Set([...payments.map((p) => p.userId), ...subscriptions.map((s) => s.userId)])) {
    emails.set(id, (await store.findUserById(id))?.email ?? '—')
  }

  const jobs = lastBillingJobs()
  const pendingTotal = payments
    .filter((payment) => payment.status === 'pending')
    .reduce((total, payment) => total + payment.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Платежи и подписки</h1>
        <p className="mt-1 text-sm text-text-muted">
          Приём оплаты: {config.billing.provider === 'yookassa' ? 'ЮKassa' : 'вручную по счёту'} ·
          в ожидании {formatPrice(pendingTotal)} · автопродление{' '}
          {config.billing.autopay ? 'включено' : 'выключено (YOOKASSA_AUTOPAY)'} · чеки{' '}
          {config.billing.receipts.enabled
            ? `через ЮKassa, ${config.billing.receipts.mode === 'prepayment' ? 'аванс + полный расчёт' : 'полный расчёт сразу'}, НДС код ${config.billing.receipts.vatCode}`
            : 'выбивает своя касса'}
        </p>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-text-secondary">
          Автопродление и чеки идут сами раз в 10 минут.{' '}
          {jobs
            ? `Последний запуск ${formatDateTime(jobs.at)}: списано ${jobs.report.charged}, отказов ${jobs.report.failed}, предупреждений ${jobs.report.notices}, вторых чеков ${jobs.report.settlements}${jobs.report.errors.length ? `, ошибок ${jobs.report.errors.length}: ${jobs.report.errors[0]}` : ''}.`
            : 'С момента запуска сайта ещё не выполнялись.'}
        </p>
        <ActionButton endpoint="/api/v1/admin/billing-jobs" label="Запустить сейчас" />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Последние платежи</h2>
        </div>
        <DataTable
          rows={payments}
          getKey={(payment) => payment.id}
          minWidth={1100}
          empty="Платежей пока не было."
          columns={[
            { key: 'date', header: 'Дата', primary: true, render: (payment) => formatDateTime(payment.createdAt) },
            { key: 'user', header: 'Пользователь', render: (payment) => emails.get(payment.userId) },
            {
              key: 'plan',
              header: 'Тариф',
              render: (payment) =>
                payment.kind === 'upgrade' && payment.fromPlan
                  ? `${getPlan(payment.fromPlan).name} → ${getPlan(payment.plan).name}, доплата`
                  : `${getPlan(payment.plan).name}, ${payment.months} мес.`,
            },
            {
              key: 'amount',
              header: 'Сумма',
              render: (payment) => <span className="tabular-nums">{formatPrice(payment.amount)}</span>,
            },
            {
              key: 'provider',
              header: 'Провайдер',
              render: (payment) => (
                <span className="text-text-muted">
                  {payment.provider === 'yookassa' ? 'ЮKassa' : payment.provider}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Статус',
              render: (payment) => (
                <span className={STATUS[payment.status]?.className ?? ''}>
                  {STATUS[payment.status]?.label ?? payment.status}
                  {payment.recurring && <span className="text-text-muted"> · автосписание</span>}
                  {refundedAmount(payment) > 0 && (
                    <span className="block text-xs text-warning">
                      возвращено {formatPrice(refundedAmount(payment))}
                      {payment.refunds.some((refund) => refund.status === 'pending') ? ' (проводится)' : ''}
                    </span>
                  )}
                  {payment.status === 'canceled' && payment.failureReason && (
                    <span className="block text-xs text-text-muted">{failureText(payment.failureReason)}</span>
                  )}
                </span>
              ),
            },
            {
              key: 'receipt',
              header: 'Чеки',
              render: (payment) => <span className="text-xs text-text-muted">{receiptSummary(payment)}</span>,
            },
            {
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (payment) =>
                payment.status === 'pending' ? (
                  <>
                    <ActionButton
                      endpoint="/api/v1/admin/payments"
                      body={{ paymentId: payment.id, action: 'confirm' }}
                      label="Подтвердить"
                      variant="primary"
                      confirm={`Подтвердить оплату ${formatPrice(payment.amount)} и включить подписку?`}
                    />
                    <ActionButton
                      endpoint="/api/v1/admin/payments"
                      body={{ paymentId: payment.id, action: 'cancel' }}
                      label="Отменить"
                      variant="danger"
                    />
                  </>
                ) : payment.status === 'succeeded' && payment.amount - refundedAmount(payment) > 0 ? (
                  <RefundForm
                    paymentId={payment.id}
                    remaining={payment.amount - refundedAmount(payment)}
                    viaProvider={payment.provider === 'yookassa' && Boolean(payment.providerPaymentId)}
                  />
                ) : null,
            },
          ]}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Активные подписки ({subscriptions.length})</h2>
        </div>
        <DataTable
          rows={subscriptions}
          getKey={(subscription) => subscription.id}
          minWidth={960}
          empty="Активных подписок нет."
          columns={[
            {
              key: 'user',
              header: 'Пользователь',
              primary: true,
              render: (subscription) => emails.get(subscription.userId),
            },
            { key: 'plan', header: 'Тариф', render: (subscription) => getPlan(subscription.plan).name },
            {
              key: 'expires',
              header: 'Действует до',
              render: (subscription) => formatDate(subscription.expiresAt),
            },
            {
              key: 'source',
              header: 'Источник',
              render: (subscription) => (
                <span className="text-text-muted">
                  {subscription.provider === 'admin'
                    ? 'выдана вручную'
                    : subscription.provider === 'trial'
                      ? 'пробный период'
                      : subscription.provider || '—'}
                </span>
              ),
            },
            {
              key: 'autopay',
              header: 'Автопродление',
              render: (subscription) =>
                subscription.autoRenew ? (
                  <span className="text-xs">
                    {subscription.paymentMethodTitle || 'включено'}, на {subscription.renewMonths} мес.
                    {subscription.renewError && (
                      <span className="block text-warning">
                        {subscription.renewError}
                        {subscription.renewNextAt ? `, повтор ${formatDateTime(subscription.renewNextAt)}` : ''}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-text-muted">{subscription.renewError || 'нет'}</span>
                ),
            },
            {
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (subscription) => (
                <>
                  {subscription.autoRenew && (
                    <ActionButton
                      endpoint="/api/v1/admin/subscriptions"
                      body={{ action: 'autopay-off', userId: subscription.userId }}
                      label="Выключить автопродление"
                      confirm={`Выключить автопродление у ${emails.get(subscription.userId)}? Карта будет отвязана.`}
                    />
                  )}
                  <ActionButton
                    endpoint="/api/v1/admin/subscriptions"
                    body={{ action: 'cancel', userId: subscription.userId }}
                    label="Отменить"
                    variant="danger"
                    confirm={`Отменить подписку ${emails.get(subscription.userId)}?`}
                  />
                </>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
