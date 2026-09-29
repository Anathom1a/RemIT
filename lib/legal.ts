import { config } from './config'

/**
 * Реквизиты владельца сервиса в правовых документах.
 *
 * На сайте выводим только заполненное: заглушки вида «[наименование, ИНН]»
 * посетителю ни к чему, а напоминание, что заполнить, живёт в админке.
 */

const FIELDS: { key: keyof typeof config.legal; label: string }[] = [
  { key: 'name', label: 'Наименование' },
  { key: 'inn', label: 'ИНН' },
  { key: 'ogrn', label: 'ОГРН / ОГРНИП' },
  { key: 'address', label: 'Адрес' },
  { key: 'bank', label: 'Банковские реквизиты' },
  { key: 'phone', label: 'Телефон' },
]

/** Строка для текста документа: «ООО „Ремит“, ИНН …, ОГРН …, адрес: …». */
export function legalEntity(): string {
  const { name, inn, ogrn, address } = config.legal
  const parts = [
    name,
    inn && `ИНН ${inn}`,
    ogrn && `ОГРН ${ogrn}`,
    address && `адрес: ${address}`,
  ].filter(Boolean)
  // Пока реквизитов нет, называем владельца через сервис — это однозначно
  // и не выглядит недописанным текстом.
  return parts.length > 0 ? parts.join(', ') : `владелец сервиса ${config.brand.name}`
}

/** Банковские реквизиты одной строкой: заданные целиком или собранные из полей для счетов. */
export function bankLine(): string {
  if (config.legal.bank) return config.legal.bank
  const { bankName, bik, account, corrAccount } = config.legal
  return [bankName, bik && `БИК ${bik}`, account && `р/с ${account}`, corrAccount && `к/с ${corrAccount}`]
    .filter(Boolean)
    .join(', ')
}

/** Реквизиты списком «подпись — значение» для раздела «Реквизиты». */
export function legalDetails(): { label: string; value: string }[] {
  const rows = FIELDS.map(({ key, label }) => ({ label, value: key === 'bank' ? bankLine() : config.legal[key] })).filter(
    (row) => row.value,
  )
  rows.push({ label: 'Почта', value: config.brand.supportEmail })
  return rows
}

/** Что не заполнено — для чек-листа в админке. */
export function missingLegalFields(): string[] {
  // Банковские реквизиты и телефон нужны оферте, но без них документы
  // не выглядят недописанными, поэтому в обязательные их не включаем.
  const required: (keyof typeof config.legal)[] = ['name', 'inn', 'ogrn', 'address']
  return FIELDS.filter(({ key }) => required.includes(key) && !config.legal[key]).map(
    ({ label }) => label,
  )
}
