// Документы для организаций: реквизиты в профиле, счёт из кабинета и из
// админки (корпоративный), подписанные ссылки, «оплата получена» → подписка
// и акт, отмена просроченного счёта, акт к оплате картой.
import fs from 'node:fs'
import path from 'node:path'
import { checker, session, sleep, until } from '../lib/http.mjs'
import { editStore, readStore } from '../lib/store.mjs'

const B = process.env.BASE
const { check, finish } = checker()
const jobs = async () =>
  (await (await fetch(B + '/api/v1/billing/jobs', { method: 'POST', headers: { authorization: 'Bearer svc-inv' } })).json()).report

// Письма, где получатель среди «Кому» (у счетов их бывает два).
function mails(address) {
  const dir = process.env.MAIL_DIR
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .sort()
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8').replace(/=\r?\n/g, '').replace(/=3D/g, '='))
    .filter((raw) => (raw.match(/^To: (.*)$/m)?.[1] ?? '').includes(address))
}
const linkIn = (raw, kind) => raw.match(new RegExp(`https?://[^\\s"<]+/dokument/${kind}/[A-Za-z0-9_-]+\\?t=[A-Za-z0-9_-]+`))?.[0]
const userOf = async (email) => (await readStore()).users.find((user) => user.email === email)
const paymentsOf = async (email) => {
  const s = await readStore()
  const user = s.users.find((item) => item.email === email)
  return s.payments.filter((payment) => payment.userId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
const activeSub = async (email) => {
  const s = await readStore()
  const user = s.users.find((item) => item.email === email)
  return s.subscriptions.find((sub) => sub.userId === user.id && sub.status === 'active' && new Date(sub.expiresAt) > new Date())
}
const year = new Date().getFullYear()

const admin = session(B, '10.50.0.1')
await admin.post('/api/v1/auth/register', { email: 'admin@remit.su', password: 'AdminPass123', name: 'A' })
const org = session(B, '10.50.0.2')
await org.post('/api/v1/auth/register', { email: 'org@inv.test', password: 'OrgPass1234', name: 'Ольга' })
const anon = session(B, '10.50.0.9')

// ---------- реквизиты
let text = (await org.page('/kabinet/podpiska')).text
check('подписка: оплата по счёту предлагается', text.includes('Оплата по счёту для организаций') && text.includes('заполните реквизиты'), text.slice(0, 200))
let r = await org.post('/api/v1/billing/checkout', { plan: 'pro', months: 12, method: 'invoice' })
check('без реквизитов счёт не выставить', r.status === 400 && r.data.error.includes('реквизиты'), r.data)

const company = {
  action: 'save',
  name: 'ООО «Ромашка»',
  inn: '7707083893',
  kpp: '773601001',
  ogrn: '1027700132195',
  address: '117997, г. Москва, ул. Вавилова, д. 19',
  documentsEmail: 'buh@inv.test',
}
r = await org.post('/api/v1/account/company', { ...company, inn: '7707083890' })
check('ИНН с неверной контрольной цифрой — отказ', r.status === 400 && r.data.error.includes('ИНН'), r.data)
r = await org.post('/api/v1/account/company', { ...company, kpp: '' })
check('организация без КПП — отказ', r.status === 400 && r.data.error.includes('КПП'), r.data)
r = await org.post('/api/v1/account/company', { ...company, ogrn: '1027700132190' })
check('неверный ОГРН — отказ', r.status === 400 && r.data.error.includes('ОГРН'), r.data)
r = await org.post('/api/v1/account/company', company)
check('реквизиты сохранены', r.status === 200 && r.data.company.inn === '7707083893', r.data)
text = (await org.page('/kabinet/profil')).text
check('профиль: реквизиты', (await org.page('/kabinet/profil')).html.includes('7707083893') && text.includes('Реквизиты организации'))

// ИП: 12 цифр, КПП не нужен и не сохраняется.
const ip = session(B, '10.50.0.3')
await ip.post('/api/v1/auth/register', { email: 'ip@inv.test', password: 'IpPass12345', name: 'Пётр' })
r = await ip.post('/api/v1/account/company', {
  name: 'ИП Петров Пётр Петрович',
  inn: '500100732259',
  kpp: '123456789',
  ogrn: '304500116000157',
  address: '141000, Московская обл., г. Мытищи, ул. Мира, д. 1',
})
check('ИП без КПП', r.status === 200 && r.data.company.kpp === '', r.data)

// ---------- счёт из кабинета
r = await org.post('/api/v1/billing/checkout', { plan: 'pro', months: 12, method: 'invoice' })
check('счёт выставлен', r.status === 200 && r.data.redirectUrl.startsWith('/kabinet/podpiska?schet='), r.data)
let [invoice] = await paymentsOf('org@inv.test')
check(
  'счёт: по счёту, ждёт оплаты, номер, реквизиты, сумма',
  invoice.provider === 'invoice' &&
    invoice.status === 'pending' &&
    invoice.documentNumber === `${year}-00001` &&
    invoice.buyer.inn === '7707083893' &&
    invoice.amount === 890000,
  invoice,
)
check('ЮKassa не участвует', !invoice.confirmationUrl.startsWith('http'))
const invoiceMail = await until(async () => mails('buh@inv.test')[0], 10_000, 300)
check('письмо со счётом и владельцу, и в бухгалтерию', Boolean(invoiceMail) && /^To: .*org@inv\.test/m.test(invoiceMail), invoiceMail?.slice(0, 300))
const invoiceLink = invoiceMail && linkIn(invoiceMail, 'schet')
check('в письме — подписанная ссылка на счёт', Boolean(invoiceLink) && invoiceLink.startsWith(B), invoiceLink)

let doc = await anon.page(invoiceLink)
check('счёт открывается без входа', doc.status === 200, doc.status)
check('счёт: номер, дата, получатель, банк', doc.text.includes(`Счёт на оплату № ${year}-00001`) && doc.text.includes('044525999') && doc.text.includes('40702810900000000001') && doc.text.includes('ООО «Ремит»'), doc.text.slice(0, 400))
check('счёт: покупатель', doc.text.includes('ООО «Ромашка», ИНН 7707083893, КПП 773601001'))
check('счёт: сумма и прописью, без НДС', doc.text.includes('8 900,00') && doc.text.includes('Восемь тысяч девятьсот рублей 00 копеек') && doc.text.includes('Без НДС'), doc.text.match(/Всего наименований.{0,160}/)?.[0])
check('счёт: услуга и срок оплаты', doc.text.includes('по тарифу «Профи», 12 мес.') && doc.text.includes('Оплатить не позднее'), doc.text.match(/Предоставление.{0,120}/)?.[0])
check('счёт не индексируется', doc.html.includes('noindex'))
check('чужая подпись — 404', (await anon.page(invoiceLink.replace(/t=.{4}/, 't=AAAA'))).status === 404)
check('без подписи и входа — 404', (await anon.page(`/dokument/schet/${invoice.id}`)).status === 404)
check('владельцу подпись не нужна', (await org.page(`/dokument/schet/${invoice.id}`)).status === 200)
check('другому пользователю без подписи — 404', (await ip.page(`/dokument/schet/${invoice.id}`)).status === 404)
check('акта до оплаты нет', (await org.page(`/dokument/akt/${invoice.id}`)).status === 404)

text = (await org.page(r.data.redirectUrl)).text
check('кабинет: счёт ждёт оплаты', text.includes(`Счёт № ${year}-00001 ожидает оплаты`) && text.includes('Открыть счёт'), text.slice(0, 300))
check('подписка до оплаты не включена', !(await activeSub('org@inv.test')))

// Повышение по счёту не выставляется: только полный тариф.
r = await ip.post('/api/v1/billing/checkout', { plan: 'corporate', months: 12, method: 'invoice' })
check('корпоративный — только через отдел продаж', r.status === 400, r.data)

// ---------- счёт из админки: корпоративный
r = await org.post('/api/v1/admin/payments', { action: 'invoice', email: 'ip@inv.test', plan: 'corporate', months: '12', amount: '450000' })
check('не-админ счёт не выставит', [401, 403].includes(r.status), r.status)
const plain = session(B, '10.50.0.4')
await plain.post('/api/v1/auth/register', { email: 'plain@inv.test', password: 'PlainPass123', name: 'Без реквизитов' })
r = await admin.post('/api/v1/admin/payments', { action: 'invoice', email: 'plain@inv.test', plan: 'pro', months: '1' })
check('админка: без реквизитов пользователя — отказ', r.status === 400 && r.data.error.includes('реквизиты'), r.data)
r = await admin.post('/api/v1/admin/payments', { action: 'invoice', email: 'ip@inv.test', plan: 'corporate', months: '12' })
check('корпоративный без суммы — отказ', r.status === 400, r.data)
r = await admin.post('/api/v1/admin/payments', { action: 'invoice', email: 'ip@inv.test', plan: 'corporate', months: '12', amount: '450 000', concurrentSessions: '25' })
check('корпоративный счёт', r.status === 200 && r.data.payment.amount === 45000000 && r.data.payment.concurrentSessions === 25 && r.data.payment.documentNumber === `${year}-00002`, r.data)
const corporate = r.data.payment
doc = await ip.page(`/dokument/schet/${corporate.id}`)
check('корпоративный: лимит сессий в счёте, ИП без КПП', doc.text.includes('до 25 одновременных сессий') && doc.text.includes('ИП Петров Пётр Петрович, ИНН 500100732259, 141000') && doc.text.includes('Четыреста пятьдесят тысяч рублей'), doc.text.match(/Покупатель.{0,120}/)?.[0])
text = (await admin.page('/admin/platezhi')).text
check('админка: номер счёта, покупатель, «Оплата получена»', text.includes(`счёт № ${year}-00001`) && text.includes('ООО «Ромашка», ИНН 7707083893') && text.includes('Оплата получена'))

// ---------- оплата получена
r = await admin.post('/api/v1/admin/payments', { paymentId: invoice.id, action: 'confirm' })
check('оплата отмечена', r.status === 200, r.data)
let sub = await activeSub('org@inv.test')
check('подписка «Профи» на год', sub?.plan === 'pro' && new Date(sub.expiresAt) > new Date(Date.now() + 360 * 86400000), sub)
invoice = (await paymentsOf('org@inv.test'))[0]
check('счёт оплачен, номер тот же', invoice.status === 'succeeded' && invoice.documentNumber === `${year}-00001`, invoice)
const paidMail = await until(async () => mails('buh@inv.test').find((raw) => raw.includes('/dokument/akt/')), 10_000, 300)
const actLink = paidMail && linkIn(paidMail, 'akt')
check('письмо об оплате с актом', Boolean(actLink), paidMail?.slice(0, 300))
doc = await anon.page(actLink)
check('акт открывается по ссылке', doc.status === 200 && doc.text.includes(`Акт № ${year}-00001`), doc.status)
check('акт: стороны, основание, период, сумма', doc.text.includes('Исполнитель') && doc.text.includes('Заказчик') && doc.text.includes(`счёт № ${year}-00001`) && /с \d\d\.\d\d\.\d{4} по \d\d\.\d\d\.\d{4}/.test(doc.text) && doc.text.includes('8 900,00'), doc.text.match(/Предоставление.{0,160}/)?.[0])
check('акт: приёмка без подписи — п. 5.2 оферты', doc.text.includes('5.2 оферты'))
check('ссылка на счёт не открывает акт', (await anon.page(invoiceLink.replace('/schet/', '/akt/'))).status === 404)
text = (await org.page('/kabinet/podpiska')).text
check('кабинет: счёт и акт в истории', text.includes(`Счёт на оплату № ${year}-00001`) && text.includes(`Акт № ${year}-00001`))
check('чек по счёту не выдаётся', invoice.receipts.length === 0 && invoice.settlement === '', invoice)

r = await admin.post('/api/v1/admin/payments', { paymentId: corporate.id, action: 'confirm' })
sub = await activeSub('ip@inv.test')
check('корпоративный включён с лимитом 25', sub?.plan === 'corporate' && sub.concurrentSessions === 25, sub)

// ---------- продление по счёту, просрочка, поздняя оплата
r = await org.post('/api/v1/billing/checkout', { plan: 'business', months: 12, method: 'invoice' })
check('другой тариф при оплаченном — отказ', r.status === 400, r.data)
r = await org.post('/api/v1/billing/checkout', { plan: 'pro', months: 12, method: 'invoice' })
check('продление по счёту', r.status === 200)
let renewal = (await paymentsOf('org@inv.test')).at(-1)
check('номер следующий', renewal.documentNumber === `${year}-00003`, renewal.documentNumber)
await editStore((s) => {
  s.payments.find((item) => item.id === renewal.id).createdAt = new Date(Date.now() - 31 * 86400000).toISOString()
})
const report = await jobs()
renewal = (await paymentsOf('org@inv.test')).find((item) => item.id === renewal.id)
check('просроченный счёт отменён', renewal.status === 'canceled' && renewal.failureReason === 'invoice_expired' && report.invoicesCanceled === 1, { renewal, report })
doc = await org.page(`/dokument/schet/${renewal.id}`)
check('отменённый счёт помечен', doc.text.includes('Счёт отменён'))
text = (await admin.page('/admin/platezhi')).text
check('админка: поздняя оплата отменённого счёта возможна', text.includes('счёт не оплачен в срок'))
const before = new Date((await activeSub('org@inv.test')).expiresAt)
r = await admin.post('/api/v1/admin/payments', { paymentId: renewal.id, action: 'confirm' })
sub = await activeSub('org@inv.test')
check('поздняя оплата продлила подписку на год', new Date(sub.expiresAt) - before > 360 * 86400000, { before, after: sub.expiresAt })

// ---------- оплата картой организацией: акт вместе с чеком полного расчёта
const card = session(B, '10.50.0.5')
await card.post('/api/v1/auth/register', { email: 'card@inv.test', password: 'CardPass123', name: 'Карта' })
await card.post('/api/v1/account/company', { ...company, name: 'ООО «Василёк»', documentsEmail: '' })
r = await card.post('/api/v1/billing/checkout', { plan: 'start', months: 1 })
await fetch(r.data.redirectUrl, { redirect: 'manual' })
await card.get('/kabinet/podpiska')
let cardPayment = (await paymentsOf('card@inv.test'))[0]
check('картой: оплачено, реквизиты и номер акта', cardPayment.status === 'succeeded' && cardPayment.buyer?.name === 'ООО «Василёк»' && cardPayment.documentNumber === `${year}-00004`, cardPayment)
check('картой: акт — после оплаченного периода (как второй чек)', (await card.page(`/dokument/akt/${cardPayment.id}`)).status === 404)
check('картой: счёта нет', (await card.page(`/dokument/schet/${cardPayment.id}`)).status === 404)
await editStore((s) => {
  s.payments.find((item) => item.id === cardPayment.id).serviceEndsAt = new Date(Date.now() - 1000).toISOString()
})
await sleep(100)
doc = await card.page(`/dokument/akt/${cardPayment.id}`)
check('картой: акт по окончании периода', doc.status === 200 && doc.text.includes('ООО «Василёк»') && doc.text.includes('оплата от'), doc.status)

// Удаление реквизитов не трогает выставленные документы.
await org.post('/api/v1/account/company', { action: 'delete' })
check('реквизиты удалены', !(await readStore()).companies.some((item) => item.userId === invoice.userId))
check('документы остались', (await anon.page(actLink)).status === 200)

// Оферта описывает порядок.
text = (await anon.page('/dokumenty/oferta')).text
check('оферта: п. 5.2 про счета и акты', text.includes('5.2. Оплата организациями и закрывающие документы'))

finish()
