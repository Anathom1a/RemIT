import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { PromoForm } from '@/components/admin/promo-form'
import { DataTable } from '@/components/ui/data-table'
import { config } from '@/lib/config'
import { formatPrice, purchasablePlans } from '@/lib/plans'
import { describePromo } from '@/lib/promo'
import { getStore } from '@/lib/store'
import { formatDate } from '@/lib/time'

export const metadata: Metadata = { title: 'Промокоды' }
export const dynamic = 'force-dynamic'

export default async function AdminPromoPage() {
  const store = await getStore()
  const [promoCodes, payments] = await Promise.all([store.listPromoCodes(), store.listRecentPayments(500)])
  // Сколько скидок выдано по коду — по последним платежам.
  const given = new Map<string, number>()
  for (const payment of payments) {
    if (payment.promoCode && payment.status === 'succeeded') {
      given.set(payment.promoCode, (given.get(payment.promoCode) ?? 0) + payment.discount)
    }
  }
  const now = Date.now()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Промокоды</h1>
        <p className="mt-1 text-sm text-text-muted">
          Скидка на один платёж за тариф — картой или по счёту. Доплата за повышение и автопродление — по обычной
          цене. Код на 100% включает тариф без оплаты. Ссылка с кодом: {config.rustdesk.apiServer}
          /kabinet/podpiska?promo=КОД
        </p>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold">Новый промокод</h2>
        <PromoForm plans={purchasablePlans().map((plan) => ({ id: plan.id, name: plan.name }))} />
      </div>

      <div className="card overflow-hidden">
        <DataTable
          rows={promoCodes}
          getKey={(promo) => promo.code}
          minWidth={900}
          empty="Промокодов пока нет."
          columns={[
            {
              key: 'code',
              header: 'Код',
              primary: true,
              render: (promo) => (
                <span>
                  <span className="font-mono">{promo.code}</span>
                  {promo.note && <span className="block text-xs text-text-muted">{promo.note}</span>}
                </span>
              ),
            },
            { key: 'terms', header: 'Условия', render: (promo) => <span className="text-sm">{describePromo(promo)}</span> },
            {
              key: 'uses',
              header: 'Применён',
              render: (promo) => (
                <span className="tabular-nums">
                  {promo.usedCount}
                  {promo.maxUses != null ? ` из ${promo.maxUses}` : ''}
                  {given.get(promo.code) ? (
                    <span className="block text-xs text-text-muted">скидок на {formatPrice(given.get(promo.code) ?? 0)}</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'state',
              header: 'Состояние',
              render: (promo) =>
                !promo.active ? (
                  <span className="text-text-muted">выключен</span>
                ) : promo.validUntil && new Date(promo.validUntil).getTime() < now ? (
                  <span className="text-text-muted">истёк {formatDate(promo.validUntil)}</span>
                ) : promo.maxUses != null && promo.usedCount >= promo.maxUses ? (
                  <span className="text-text-muted">исчерпан</span>
                ) : (
                  <span className="text-success">действует</span>
                ),
            },
            {
              key: 'actions',
              header: 'Действия',
              actions: true,
              render: (promo) => (
                <>
                  <ActionButton
                    endpoint="/api/v1/admin/promo"
                    body={{ action: 'toggle', code: promo.code }}
                    label={promo.active ? 'Выключить' : 'Включить'}
                  />
                  {promo.usedCount === 0 && (
                    <ActionButton
                      endpoint="/api/v1/admin/promo"
                      body={{ action: 'delete', code: promo.code }}
                      label="Удалить"
                      variant="danger"
                      confirm={`Удалить промокод ${promo.code}?`}
                    />
                  )}
                </>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
