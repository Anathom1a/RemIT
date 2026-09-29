import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/print-button'
import { isAdmin } from '@/lib/admin'
import { getCurrentUser } from '@/lib/auth'
import { config } from '@/lib/config'
import {
  DOCUMENT_TITLES,
  actDate,
  amountInWords,
  companyLine,
  formatMoney,
  paymentDocuments,
  seller,
  vatAmount,
  vatRate,
  verifyDocumentToken,
  type DocumentKind,
} from '@/lib/documents'
import { getPlan } from '@/lib/plans'
import { getStore } from '@/lib/store'
import { formatDate } from '@/lib/time'
import type { Payment } from '@/lib/types'

export const metadata: Metadata = { title: 'Документ', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000

/** Наименование услуги в счёте и акте. */
function serviceName(payment: Payment, kind: DocumentKind): string {
  const plan = getPlan(payment.plan)
  const sessions = payment.concurrentSessions ? `, до ${payment.concurrentSessions} одновременных сессий` : ''
  const base = `Предоставление доступа к сервису удалённого доступа ${config.brand.name} по тарифу «${plan.name}»${sessions}`
  if (payment.kind === 'upgrade') {
    const from = payment.fromPlan ? getPlan(payment.fromPlan).name : ''
    return `${base} (переход с тарифа «${from}») с ${formatDate(payment.paidAt ?? payment.createdAt)} по ${formatDate(payment.upgradeUntil)}`
  }
  // В акте — фактический период: он известен после оплаты.
  if (kind === 'akt' && payment.serviceEndsAt) {
    const start = new Date(payment.serviceEndsAt)
    start.setMonth(start.getMonth() - payment.months)
    return `${base} с ${formatDate(start)} по ${formatDate(new Date(new Date(payment.serviceEndsAt).getTime() - DAY))}`
  }
  return `${base}, ${payment.months} мес.`
}

async function allowed(payment: Payment, kind: DocumentKind, token: string): Promise<boolean> {
  if (token && verifyDocumentToken(payment.id, kind, token)) return true
  const user = await getCurrentUser()
  return Boolean(user && (user.id === payment.userId || isAdmin(user)))
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { kind: rawKind, id } = await params
  const { t = '' } = await searchParams
  if (rawKind !== 'schet' && rawKind !== 'akt') notFound()
  const kind = rawKind as DocumentKind

  const store = await getStore()
  const payment = await store.findPaymentById(id)
  if (!payment || !payment.buyer || !(await allowed(payment, kind, t))) notFound()
  if (!paymentDocuments(payment).includes(kind)) notFound()

  const from = seller()
  const buyer = payment.buyer
  const date = kind === 'schet' ? payment.createdAt : (actDate(payment) ?? payment.createdAt)
  const rate = vatRate()
  const vat = vatAmount(payment.amount)
  const vatLine = rate ? `В том числе НДС ${rate}%` : 'Без НДС'
  const title = `${DOCUMENT_TITLES[kind]} № ${payment.documentNumber} от ${formatDate(date)}`
  const dueDate = new Date(new Date(payment.createdAt).getTime() + config.billing.invoices.validDays * DAY)
  const name = serviceName(payment, kind)
  const unpaid = kind === 'schet' && payment.status !== 'succeeded'

  return (
    <div className="doc-root">
      <style>{DOCUMENT_CSS}</style>
      <div className="doc-toolbar">
        <PrintButton />
        <span>
          {kind === 'schet'
            ? payment.status === 'succeeded'
              ? 'Счёт оплачен.'
              : payment.status === 'canceled'
                ? 'Счёт отменён — выставите новый в кабинете.'
                : `Оплатите до ${formatDate(dueDate)}.`
            : 'Акт об оказании услуг.'}
        </span>
      </div>

      <article className="doc-page">
        {kind === 'schet' && (
          <table className="doc-bank">
            <tbody>
              <tr>
                <td colSpan={2} rowSpan={2} className="doc-bank-name">
                  {from.bankName}
                  <div className="doc-caption">Банк получателя</div>
                </td>
                <td>БИК</td>
                <td>{from.bik}</td>
              </tr>
              <tr>
                <td>Сч. №</td>
                <td>{from.corrAccount}</td>
              </tr>
              <tr>
                <td>ИНН {from.inn}</td>
                <td>{from.kpp ? `КПП ${from.kpp}` : ''}</td>
                <td rowSpan={2}>Сч. №</td>
                <td rowSpan={2}>{from.account}</td>
              </tr>
              <tr>
                <td colSpan={2}>
                  {from.name}
                  <div className="doc-caption">Получатель</div>
                </td>
              </tr>
            </tbody>
          </table>
        )}

        <h1>{title}</h1>

        <dl className="doc-parties">
          <dt>{kind === 'schet' ? 'Поставщик' : 'Исполнитель'}:</dt>
          <dd>{companyLine(from)}</dd>
          <dt>{kind === 'schet' ? 'Покупатель' : 'Заказчик'}:</dt>
          <dd>{companyLine(buyer)}</dd>
          {kind === 'akt' && (
            <>
              <dt>Основание:</dt>
              <dd>
                Публичная оферта {config.brand.name} ({config.brand.domain}/dokumenty/oferta)
                {payment.provider === 'invoice'
                  ? `, счёт № ${payment.documentNumber} от ${formatDate(payment.createdAt)}`
                  : `, оплата от ${formatDate(payment.paidAt)}`}
              </dd>
            </>
          )}
        </dl>

        <table className="doc-items">
          <thead>
            <tr>
              <th>№</th>
              <th>{kind === 'schet' ? 'Товары (работы, услуги)' : 'Наименование услуги'}</th>
              <th>Кол-во</th>
              <th>Ед.</th>
              <th>Цена</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td className="doc-left">{name}</td>
              <td>1</td>
              <td>усл.</td>
              <td className="doc-right">{formatMoney(payment.amount)}</td>
              <td className="doc-right">{formatMoney(payment.amount)}</td>
            </tr>
          </tbody>
        </table>

        <table className="doc-totals">
          <tbody>
            <tr>
              <td>Итого:</td>
              <td>{formatMoney(payment.amount)}</td>
            </tr>
            <tr>
              <td>{vatLine}:</td>
              <td>{rate ? formatMoney(vat) : '—'}</td>
            </tr>
            <tr>
              <td>{kind === 'schet' ? 'Всего к оплате:' : 'Всего:'}</td>
              <td>{formatMoney(payment.amount)}</td>
            </tr>
          </tbody>
        </table>

        <p>
          {kind === 'schet' ? 'Всего наименований' : 'Всего оказано услуг'} 1, на сумму {formatMoney(payment.amount)} руб.
          <br />
          <strong>{amountInWords(payment.amount)}</strong>
          {rate ? `, в том числе НДС ${formatMoney(vat)} руб.` : ', НДС не облагается.'}
        </p>

        {kind === 'schet' ? (
          <div className="doc-notes">
            <p>
              Оплатить не позднее {formatDate(dueDate)}. В назначении платежа укажите: «Оплата по счёту №{' '}
              {payment.documentNumber} от {formatDate(payment.createdAt)}. {rate ? `В т. ч. НДС ${rate}%` : 'Без НДС'}».
            </p>
            <p>
              Оплата означает согласие с условиями публичной оферты {config.brand.name} ({config.brand.domain}
              /dokumenty/oferta). Доступ предоставляется после поступления денег на расчётный счёт; акт будет
              доступен в личном кабинете.
            </p>
            {unpaid && payment.status === 'canceled' && <p className="doc-warning">Счёт отменён и не подлежит оплате.</p>}
          </div>
        ) : (
          <div className="doc-notes">
            <p>
              Вышеперечисленные услуги оказаны полностью и в срок. Заказчик претензий по объёму, качеству и срокам
              оказания услуг не имеет.
            </p>
            <p>
              Если в течение 5 рабочих дней с даты акта Заказчик не направит мотивированных возражений, услуги
              считаются принятыми без подписи Заказчика (п. 5.2 оферты).
            </p>
          </div>
        )}

        <div className="doc-signs">
          <div>
            <div className="doc-sign-title">{kind === 'schet' ? from.signerTitle : 'Исполнитель'}</div>
            <div className="doc-sign-line">
              <span />
              {from.signer}
            </div>
            {kind === 'akt' && <div className="doc-caption">{from.signerTitle}</div>}
          </div>
          {kind === 'akt' ? (
            <div>
              <div className="doc-sign-title">Заказчик</div>
              <div className="doc-sign-line">
                <span />
              </div>
              <div className="doc-caption">{buyer.name}</div>
            </div>
          ) : (
            <div />
          )}
        </div>
      </article>
    </div>
  )
}

const DOCUMENT_CSS = `
body { background: #e5e7eb !important; color: #111 !important; }
.doc-root { min-height: 100vh; padding: 24px 16px 48px; font-family: Arial, Helvetica, sans-serif; color: #111; }
.doc-toolbar { max-width: 794px; margin: 0 auto 16px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 14px; color: #374151; }
.doc-button { background: #3457D5; color: #fff; border: 0; border-radius: 8px; padding: 9px 16px; font-size: 14px; cursor: pointer; }
.doc-page { max-width: 794px; margin: 0 auto; background: #fff; padding: 48px 56px; box-shadow: 0 1px 4px rgba(0,0,0,.15); font-size: 13px; line-height: 1.45; }
.doc-page h1 { font-size: 20px; font-weight: bold; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #111; }
.doc-page p { margin: 10px 0; }
.doc-page table { width: 100%; border-collapse: collapse; }
.doc-bank td { border: 1px solid #111; padding: 4px 6px; vertical-align: top; }
.doc-bank td:nth-child(odd):not(.doc-bank-name) { white-space: nowrap; }
.doc-caption { font-size: 11px; color: #555; margin-top: 4px; }
.doc-parties { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; margin: 0 0 16px; }
.doc-parties dt { color: #333; }
.doc-parties dd { margin: 0; font-weight: bold; }
.doc-items th, .doc-items td { border: 1px solid #111; padding: 5px 6px; text-align: center; vertical-align: top; }
.doc-items th { background: #f3f4f6; }
.doc-items th:not(:nth-child(2)) { white-space: nowrap; }
.doc-left { text-align: left !important; }
.doc-right, .doc-totals td:last-child { text-align: right !important; white-space: nowrap; }
.doc-totals { margin-top: 6px; }
.doc-totals td { padding: 2px 6px; font-weight: bold; text-align: right; }
.doc-totals td:first-child { width: 85%; }
.doc-notes { margin-top: 12px; font-size: 12px; color: #333; }
.doc-warning { color: #b91c1c; font-weight: bold; }
.doc-signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
.doc-sign-title { font-weight: bold; margin-bottom: 28px; }
.doc-sign-line { display: flex; gap: 8px; align-items: flex-end; }
.doc-sign-line span { flex: 1; border-bottom: 1px solid #111; min-width: 120px; }
@media (max-width: 640px) {
  .doc-page { padding: 24px 12px; font-size: 12px; }
  .doc-parties { grid-template-columns: 1fr; }
  .doc-signs { grid-template-columns: 1fr; }
  .doc-bank td { white-space: normal !important; overflow-wrap: anywhere; }
  .doc-items th, .doc-items td { padding: 4px 3px; }
  .doc-items th:not(:nth-child(2)) { white-space: normal; }
}
@media print {
  body { background: #fff !important; }
  .doc-root { padding: 0; }
  .doc-toolbar { display: none; }
  .doc-page { box-shadow: none; max-width: none; padding: 0; }
  @page { size: A4; margin: 15mm; }
}
`
