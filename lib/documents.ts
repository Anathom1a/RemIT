import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config'
import { bankLine } from './legal'
import { refundedAmount } from './billing-model'
import type { Company, Payment } from './types'

/**
 * Документы для организаций: реквизиты покупателя, счёт на оплату и акт.
 *
 * Счёт и акт — HTML-страницы для печати и сохранения в PDF. Ссылка на них
 * подписана: её можно переслать в бухгалтерию, и документ откроется без
 * входа в кабинет, но другой документ по ней не подобрать.
 */

export type DocumentKind = 'schet' | 'akt'

export const DOCUMENT_TITLES: Record<DocumentKind, string> = { schet: 'Счёт на оплату', akt: 'Акт' }

/* ---------------------------- Реквизиты покупателя ---------------------------- */

export class CompanyError extends Error {}

const digits = (value: string) => value.replace(/\s+/g, '')

function checksum(value: string, weights: number[]): number {
  return (weights.reduce((sum, weight, index) => sum + weight * Number(value[index]), 0) % 11) % 10
}

/** ИНН организации (10 цифр) или ИП (12 цифр) с проверкой контрольных цифр. */
export function validInn(inn: string): boolean {
  if (/^\d{10}$/.test(inn)) return checksum(inn, [2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(inn[9])
  if (/^\d{12}$/.test(inn)) {
    return (
      checksum(inn, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(inn[10]) &&
      checksum(inn, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(inn[11])
    )
  }
  return false
}

/** ОГРН (13 цифр) или ОГРНИП (15 цифр) с контрольной цифрой. */
export function validOgrn(ogrn: string): boolean {
  if (/^\d{13}$/.test(ogrn)) return Number(BigInt(ogrn.slice(0, 12)) % 11n % 10n) === Number(ogrn[12])
  if (/^\d{15}$/.test(ogrn)) return Number(BigInt(ogrn.slice(0, 14)) % 13n % 10n) === Number(ogrn[14])
  return false
}

/** Проверяет и нормализует реквизиты из формы. */
export function parseCompany(userId: string, input: Record<string, unknown>): Company {
  const text = (key: string, max = 300) => String(input[key] ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
  const name = text('name')
  const inn = digits(text('inn', 20))
  const kpp = digits(text('kpp', 20)).toUpperCase()
  const ogrn = digits(text('ogrn', 20))
  const address = text('address', 500)
  const documentsEmail = text('documentsEmail', 200).toLowerCase()

  if (name.length < 3) throw new CompanyError('Укажите полное наименование: «ООО „Ромашка“» или «ИП Петров Пётр Петрович»')
  if (!validInn(inn)) throw new CompanyError('ИНН неверный: 10 цифр у организации, 12 — у ИП')
  const organization = inn.length === 10
  if (organization && !/^\d{4}[\dA-Z]{2}\d{3}$/.test(kpp)) throw new CompanyError('КПП организации — 9 символов')
  if (ogrn && !validOgrn(ogrn)) throw new CompanyError('ОГРН неверный: 13 цифр у организации, ОГРНИП — 15 цифр')
  if (ogrn && ogrn.length !== (organization ? 13 : 15)) {
    throw new CompanyError(organization ? 'У организации ОГРН из 13 цифр' : 'У ИП ОГРНИП из 15 цифр')
  }
  if (address.length < 10) throw new CompanyError('Укажите юридический адрес')
  if (documentsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(documentsEmail)) {
    throw new CompanyError('Почта для документов указана неверно')
  }

  return {
    userId,
    name,
    inn,
    kpp: organization ? kpp : '',
    ogrn,
    address,
    documentsEmail,
    updatedAt: new Date().toISOString(),
  }
}

/** Строка реквизитов в документе: «ООО „Ромашка“, ИНН …, КПП …, адрес». */
export function companyLine(company: Pick<Company, 'name' | 'inn' | 'kpp' | 'address'>): string {
  return [company.name, `ИНН ${company.inn}`, company.kpp && `КПП ${company.kpp}`, company.address]
    .filter(Boolean)
    .join(', ')
}

/* --------------------------------- Продавец --------------------------------- */

export function seller() {
  const legal = config.legal
  return {
    name: legal.name,
    inn: legal.inn,
    kpp: legal.kpp,
    ogrn: legal.ogrn,
    address: legal.address,
    bankName: legal.bankName,
    bik: legal.bik,
    account: legal.account,
    corrAccount: legal.corrAccount,
    bank: bankLine(),
    signer: legal.signer,
    signerTitle: legal.signerTitle,
  }
}

/** Чего не хватает, чтобы выставлять счета. Пусто — можно. */
export function missingInvoiceFields(): string[] {
  const legal = config.legal
  const required: [string, string][] = [
    ['наименование (REMIT_LEGAL_NAME)', legal.name],
    ['ИНН (REMIT_LEGAL_INN)', legal.inn],
    ['адрес (REMIT_LEGAL_ADDRESS)', legal.address],
    ['банк (REMIT_LEGAL_BANK_NAME)', legal.bankName],
    ['БИК (REMIT_LEGAL_BIK)', legal.bik],
    ['расчётный счёт (REMIT_LEGAL_ACCOUNT)', legal.account],
    ['корр. счёт (REMIT_LEGAL_CORR_ACCOUNT)', legal.corrAccount],
  ]
  return required.filter(([, value]) => !value).map(([label]) => label)
}

/** Предлагать ли оплату по счёту. */
export function invoicesAvailable(): boolean {
  return config.billing.invoices.enabled && missingInvoiceFields().length === 0
}

/** НДС в документах: null — «Без НДС». */
export function vatRate(): number | null {
  const rate = Number.parseInt(config.legal.vat, 10)
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

/** Сумма НДС, включённого в цену, в копейках. */
export function vatAmount(amount: number): number {
  const rate = vatRate()
  return rate ? Math.round((amount * rate) / (100 + rate)) : 0
}

/* ------------------------------ Номера и ссылки ------------------------------ */

/** Номер счёта: год и сквозной номер внутри года — «2026-00017». */
export function formatDocumentNumber(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(5, '0')}`
}

function sign(paymentId: string, kind: DocumentKind): string {
  return createHmac('sha256', `remit-documents:${config.auth.secret}`)
    .update(`${kind}:${paymentId}`)
    .digest('base64url')
    .slice(0, 32)
}

export function verifyDocumentToken(paymentId: string, kind: DocumentKind, token: string): boolean {
  const expected = Buffer.from(sign(paymentId, kind))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Путь документа с подписью — открывается без входа. */
export function documentPath(payment: Pick<Payment, 'id'>, kind: DocumentKind): string {
  return `/dokument/${kind}/${payment.id}?t=${sign(payment.id, kind)}`
}

export function documentUrl(payment: Pick<Payment, 'id'>, kind: DocumentKind): string {
  return `${config.rustdesk.apiServer.replace(/\/+$/, '')}${documentPath(payment, kind)}`
}

/**
 * Дата акта. По счёту — дата оплаты: так записано в п. 5.2 оферты, чеков там
 * нет. При оплате картой акт совпадает с чеком полного расчёта: при авансовой
 * схеме это конец оплаченного периода, иначе — день оплаты.
 */
export function actDate(payment: Payment): string | null {
  if (payment.status !== 'succeeded' || !payment.paidAt) return null
  if (payment.provider === 'yookassa' && config.billing.receipts.mode === 'prepayment') {
    return payment.serviceEndsAt ?? payment.paidAt
  }
  return payment.paidAt
}

/** Какие документы есть у платежа сейчас. */
export function paymentDocuments(payment: Payment, now = new Date()): DocumentKind[] {
  const kinds: DocumentKind[] = []
  if (!payment.buyer) return kinds
  if (payment.provider === 'invoice' && payment.documentNumber) kinds.push('schet')
  // Акт — за оплаченную услугу. После возврата акт на первоначальную сумму
  // уже неверен: такие документы оформляем через поддержку.
  const act = actDate(payment)
  if (act && new Date(act).getTime() <= now.getTime() && payment.documentNumber && refundedAmount(payment) === 0) {
    kinds.push('akt')
  }
  return kinds
}

/* ------------------------------ Сумма прописью ------------------------------ */

const ONES = [
  ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
  ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
]
const TEENS = [
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
]
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

/** «рубль / рубля / рублей» по числу. */
export function plural(value: number, forms: [string, string, string]): string {
  const n = Math.abs(value) % 100
  const last = n % 10
  if (n > 10 && n < 20) return forms[2]
  if (last === 1) return forms[0]
  if (last >= 2 && last <= 4) return forms[1]
  return forms[2]
}

function triad(value: number, feminine: boolean): string[] {
  const words = [HUNDREDS[Math.floor(value / 100)]]
  const rest = value % 100
  if (rest >= 10 && rest < 20) words.push(TEENS[rest - 10])
  else words.push(TENS[Math.floor(rest / 10)], ONES[feminine ? 1 : 0][rest % 10])
  return words.filter(Boolean)
}

const SCALES: { forms: [string, string, string]; feminine: boolean }[] = [
  { forms: ['', '', ''], feminine: false },
  { forms: ['тысяча', 'тысячи', 'тысяч'], feminine: true },
  { forms: ['миллион', 'миллиона', 'миллионов'], feminine: false },
  { forms: ['миллиард', 'миллиарда', 'миллиардов'], feminine: false },
]

/** Целое число прописью: 1780 → «одна тысяча семьсот восемьдесят». */
export function numberInWords(value: number): string {
  if (value === 0) return 'ноль'
  const words: string[] = []
  let rest = Math.floor(value)
  for (let scale = 0; rest > 0 && scale < SCALES.length; scale += 1) {
    const part = rest % 1000
    rest = Math.floor(rest / 1000)
    if (part === 0) continue
    const { forms, feminine } = SCALES[scale]
    const chunk = triad(part, feminine)
    if (scale > 0) chunk.push(plural(part, forms))
    words.unshift(...chunk)
  }
  return words.join(' ')
}

/** Сумма в копейках прописью: «Одна тысяча семьсот восемьдесят рублей 00 копеек». */
export function amountInWords(kopecks: number): string {
  const rubles = Math.floor(kopecks / 100)
  const cents = kopecks % 100
  const text = `${numberInWords(rubles)} ${plural(rubles, ['рубль', 'рубля', 'рублей'])} ${String(cents).padStart(2, '0')} ${plural(cents, ['копейка', 'копейки', 'копеек'])}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** 178000 → «1 780,00». */
export function formatMoney(kopecks: number): string {
  const rubles = Math.floor(kopecks / 100)
  return `${rubles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(kopecks % 100).padStart(2, '0')}`
}
