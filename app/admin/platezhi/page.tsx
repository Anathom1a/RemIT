import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { DataTable } from '@/components/ui/data-table'
import { getStore } from '@/lib/store'
import { formatPrice, getPlan } from '@/lib/plans'
import { formatDate, formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'

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

  const pendingTotal = payments
    .filter((payment) => payment.status === 'pending')
    .reduce((total, payment) => total + payment.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Платежи и подписки</h1>
        <p className="mt-1 text-sm text-text-muted">
          Приём оплаты: {config.billing.provider === 'yookassa' ? 'ЮKassa' : 'вручную по счёту'} ·
          в ожидании {formatPrice(pendingTotal)}
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Последние платежи</h2>
        </div>
        <DataTable
          rows={payments}
          getKey={(payment) => payment.id}
          minWidth={900}
          empty="Платежей пока не было."
          columns={[
            { key: 'date', header: 'Дата', primary: true, render: (payment) => formatDateTime(payment.createdAt) },
            { key: 'user', header: 'Пользователь', render: (payment) => emails.get(payment.userId) },
            {
              key: 'plan',
              header: 'Тариф',
              render: (payment) => `${getPlan(payment.plan).name}, ${payment.months} мес.`,
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
                </span>
              ),
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
          minWidth={720}
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
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (subscription) => (
                <ActionButton
                  endpoint="/api/v1/admin/subscriptions"
                  body={{ action: 'cancel', userId: subscription.userId }}
                  label="Отменить"
                  variant="danger"
                  confirm={`Отменить подписку ${emails.get(subscription.userId)}?`}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
