import { config } from './config'
import type { PaymentReceipt } from './types'

/**
 * Клиент API ЮKassa (https://yookassa.ru/developers/api): платежи,
 * сохранённые способы оплаты для автопродления и чеки по 54-ФЗ.
 * Суммы внутри сервиса — в копейках, в API — строкой в рублях.
 */

export class YookassaError extends Error {
  constructor(
    message: string,
    /** HTTP-статус ответа; 0 — сеть. */
    readonly status: number,
    /** Код ошибки ЮKassa: invalid_request, forbidden, not_found… */
    readonly code: string,
  ) {
    super(message)
    this.name = 'YookassaError'
  }

  /** Ошибка в самом запросе: повтор с теми же данными не поможет. */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429
  }
}

export function yookassaConfigured(): boolean {
  return Boolean(config.billing.yookassa.shopId && config.billing.yookassa.secretKey)
}

const rubles = (kopecks: number) => (kopecks / 100).toFixed(2)
const kopecks = (value: unknown) => Math.round(Number.parseFloat(String(value ?? '0')) * 100) || 0

async function call(method: 'GET' | 'POST', path: string, body?: unknown, idempotenceKey?: string): Promise<any> {
  const { shopId, secretKey, apiUrl } = config.billing.yookassa
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (idempotenceKey) headers['Idempotence-Key'] = idempotenceKey

  let response: Response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    throw new YookassaError(`ЮKassa недоступна: ${(error as Error).message}`, 0, 'network')
  }
  const text = await response.text()
  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!response.ok) {
    throw new YookassaError(
      `ЮKassa вернула ошибку ${response.status}: ${data.description ?? text.slice(0, 300)}`,
      response.status,
      String(data.code ?? 'error'),
    )
  }
  return data
}

export interface YookassaPayment {
  id: string
  status: string
  paid: boolean
  confirmationUrl: string
  metadata: Record<string, string>
  /** Способ оплаты; saved — ЮKassa сохранила его для автопродления. */
  paymentMethod: { id: string; saved: boolean; title: string; type: string } | null
  /** insufficient_funds, card_expired… — если платёж отменён. */
  cancellationReason: string
  refundedAmount: number
}

function toPayment(data: any): YookassaPayment {
  const method = data.payment_method
  return {
    id: String(data.id ?? ''),
    status: String(data.status ?? ''),
    paid: Boolean(data.paid),
    confirmationUrl: data.confirmation?.confirmation_url ?? '',
    metadata: data.metadata ?? {},
    paymentMethod: method?.id
      ? {
          id: String(method.id),
          saved: Boolean(method.saved),
          title: String(method.title ?? (method.card?.last4 ? `Карта *${method.card.last4}` : method.type ?? '')),
          type: String(method.type ?? ''),
        }
      : null,
    cancellationReason: String(data.cancellation_details?.reason ?? ''),
    refundedAmount: kopecks(data.refunded_amount?.value),
  }
}

export type ReceiptPaymentMode = 'full_prepayment' | 'full_payment'

/** Блок receipt: одна позиция — услуга доступа к сервису. */
export function receiptBlock(email: string, description: string, amount: number, paymentMode: ReceiptPaymentMode) {
  const { vatCode, taxSystemCode } = config.billing.receipts
  return {
    customer: { email },
    ...(taxSystemCode > 0 ? { tax_system_code: taxSystemCode } : {}),
    items: [
      {
        // ФФД ограничивает наименование 128 символами.
        description: description.slice(0, 128),
        quantity: '1.00',
        amount: { value: rubles(amount), currency: 'RUB' },
        vat_code: vatCode,
        payment_mode: paymentMode,
        payment_subject: 'service',
      },
    ],
  }
}

export interface CreatePaymentInput {
  amount: number
  description: string
  metadata: Record<string, string>
  idempotenceKey: string
  /** Чек; null — чеки выключены (выбивает своя касса). */
  receipt: ReturnType<typeof receiptBlock> | null
  /** Первая оплата: страница ЮKassa и возврат в кабинет. */
  returnUrl?: string
  /** Сохранить способ оплаты для автопродления (нужно согласие человека). */
  saveMethod?: boolean
  /** Автосписание сохранённым способом — без участия человека. */
  paymentMethodId?: string
}

export async function createPayment(input: CreatePaymentInput): Promise<YookassaPayment> {
  const body: Record<string, unknown> = {
    amount: { value: rubles(input.amount), currency: 'RUB' },
    capture: true,
    description: input.description.slice(0, 128),
    metadata: input.metadata,
  }
  if (input.receipt) body.receipt = input.receipt
  if (input.paymentMethodId) {
    body.payment_method_id = input.paymentMethodId
  } else {
    body.confirmation = { type: 'redirect', return_url: input.returnUrl }
    if (input.saveMethod) body.save_payment_method = true
  }
  return toPayment(await call('POST', '/payments', body, input.idempotenceKey))
}

export async function getPayment(id: string): Promise<YookassaPayment> {
  return toPayment(await call('GET', `/payments/${encodeURIComponent(id)}`))
}

function toReceipt(data: any): PaymentReceipt {
  const settlements: any[] = Array.isArray(data.settlements) ? data.settlements : []
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const kind: PaymentReceipt['kind'] = settlements.some((item) => item.type === 'prepayment')
    ? 'settlement'
    : items.some((item) => item.payment_mode === 'full_prepayment')
      ? 'prepayment'
      : 'full_payment'
  const status = ['pending', 'succeeded', 'canceled'].includes(data.status) ? data.status : 'pending'
  return {
    kind,
    id: String(data.id ?? ''),
    status,
    fiscalDocumentNumber: String(data.fiscal_document_number ?? ''),
    fiscalStorageNumber: String(data.fiscal_storage_number ?? ''),
    fiscalAttribute: String(data.fiscal_attribute ?? ''),
    registeredAt: data.registered_at ?? null,
  }
}

/** Чеки по платежу (только чеки прихода, без чеков возврата). */
export async function listReceipts(paymentId: string): Promise<PaymentReceipt[]> {
  const data = await call('GET', `/receipts?payment_id=${encodeURIComponent(paymentId)}`)
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return items.filter((item) => item.type !== 'refund').map(toReceipt)
}

/**
 * Второй чек — «полный расчёт» с зачётом ранее внесённого аванса. Выдаётся,
 * когда услуга оказана: по окончании оплаченного периода.
 */
export async function createSettlementReceipt(input: {
  paymentId: string
  email: string
  description: string
  amount: number
  idempotenceKey: string
}): Promise<PaymentReceipt> {
  const block = receiptBlock(input.email, input.description, input.amount, 'full_payment')
  const data = await call(
    'POST',
    '/receipts',
    {
      ...block,
      type: 'payment',
      payment_id: input.paymentId,
      send: true,
      settlements: [{ type: 'prepayment', amount: { value: rubles(input.amount), currency: 'RUB' } }],
    },
    input.idempotenceKey,
  )
  return toReceipt(data)
}

/** Проверка связи и ключей: сведения о магазине. */
export async function pingYookassa(): Promise<void> {
  await call('GET', '/me')
}
