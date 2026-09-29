// Промокоды: создание в админке и проверки, скидка в платеже ЮKassa и в чеке,
// однократность, «только первая оплата», тарифы и сроки, лимит применений,
// 100% без оплаты, автопродление по полной цене, счёт организации со скидкой.
import { checker, session } from '../lib/http.mjs'
import { readStore } from '../lib/store.mjs'

const B = process.env.BASE
const YK = process.env.YOOKASSA_URL
const { check, finish } = checker()
const ykLog = async () => (await fetch(YK + '/__log')).json()
const lastPaymentCall = async () => (await ykLog()).log.filter((entry) => entry.path === '/payments').at(-1)

const admin = session(B, '10.70.0.1')
await admin.post('/api/v1/auth/register', { email: 'admin@remit.su', password: 'AdminPass123', name: 'A' })
const promo = (body) => admin.post('/api/v1/admin/promo', { action: 'create', ...body })
let n = 1
async function account(email) {
  const who = session(B, `10.70.1.${++n}`)
  await who.post('/api/v1/auth/register', { email, password: 'Passw0rd!x', name: 'Тест' })
  return who
}
async function pay(who, body) {
  const r = await who.post('/api/v1/billing/checkout', body)
  if (r.status === 200 && r.data.redirectUrl.startsWith('http')) {
    await fetch(r.data.redirectUrl, { redirect: 'manual' })
    await who.get('/kabinet/podpiska')
  }
  return r
}
const paymentsOf = async (email) => {
  const s = await readStore()
  const user = s.users.find((item) => item.email === email)
  return s.payments.filter((payment) => payment.userId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
const promoOf = async (code) => (await readStore()).promoCodes.find((item) => item.code === code)
const check400 = (label, r, text) => check(label, r.status === 400 && r.data.error.includes(text), r.data)

// ---------- создание
const yesterday = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
let r = await promo({ code: 'spring20', kind: 'percent', value: '20', note: 'весенняя рассылка' })
check('создан SPRING20 (код в верхнем регистре)', r.status === 200 && r.data.promo.code === 'SPRING20', r.data)
check('повтор кода — отказ', (await promo({ code: 'SPRING20', kind: 'percent', value: '10' })).status === 409)
check400('кириллица в коде — отказ', await promo({ code: 'ВЕСНА', kind: 'percent', value: '10' }), 'латинских')
check400('больше 100% — отказ', await promo({ code: 'TOOMUCH', kind: 'percent', value: '150' }), '100%')
await promo({ code: 'FIX500', kind: 'fixed', value: '500', plans: ['pro'], months: ['12'] })
await promo({ code: 'FREE100', kind: 'percent', value: '100', plans: ['start'], months: ['1'], maxUses: '1' })
await promo({ code: 'NEWBIE', kind: 'percent', value: '10', firstPaymentOnly: true })
await promo({ code: 'OLD', kind: 'percent', value: '10', validUntil: yesterday })
await promo({ code: 'PAUSED', kind: 'percent', value: '10' })
await admin.post('/api/v1/admin/promo', { action: 'toggle', code: 'PAUSED' })
const stranger = await account('stranger@promo.test')
check('не-админ промокод не создаст', [401, 403].includes((await stranger.post('/api/v1/admin/promo', { action: 'create', code: 'HACK', kind: 'percent', value: '100' })).status))

// ---------- проверка кода в кабинете
const anna = await account('anna@promo.test')
r = await anna.get('/api/v1/billing/promo?code=spring20')
check('проверка: условия', r.status === 200 && r.data.terms.code === 'SPRING20' && r.data.description.includes('−20%'), r.data)
check400('неизвестный код', await anna.get('/api/v1/billing/promo?code=NOPE'), 'нет')
check400('истёкший', await anna.get('/api/v1/billing/promo?code=OLD'), 'закончился')
check400('выключенный', await anna.get('/api/v1/billing/promo?code=PAUSED'), 'нет')

// ---------- скидка картой
r = await pay(anna, { plan: 'pro', months: 1, promoCode: 'spring20' })
let [payment] = await paymentsOf('anna@promo.test')
check('платёж со скидкой 20%', payment.amount === 71200 && payment.discount === 17800 && payment.promoCode === 'SPRING20', payment)
let call = await lastPaymentCall()
check('в ЮKassa и в чеке — сумма со скидкой', call.body.amount.value === '712.00' && call.body.receipt.items[0].amount.value === '712.00', call.body)
check('оплачен, применение засчитано', payment.status === 'succeeded' && (await promoOf('SPRING20')).usedCount === 1, await promoOf('SPRING20'))
check400('второй раз тот же код — нельзя', await anna.post('/api/v1/billing/checkout', { plan: 'pro', months: 1, promoCode: 'SPRING20' }), 'уже воспользовались')
check400('«первая оплата» после оплаты — нельзя', await anna.get('/api/v1/billing/promo?code=NEWBIE'), 'первую оплату')
let text = (await anna.page('/kabinet/podpiska')).text
check('кабинет: промокод и скидка в истории', text.includes('промокод SPRING20, скидка 178'), text.match(/История платежей.{0,300}/)?.[0])

// ---------- тарифы, сроки, фиксированная скидка
const bob = await account('bob@promo.test')
check400('FIX500 на месяц — не подходит', await bob.post('/api/v1/billing/checkout', { plan: 'pro', months: 1, promoCode: 'FIX500' }), 'не подходит')
check400('FIX500 на другой тариф — не подходит', await bob.post('/api/v1/billing/checkout', { plan: 'start', months: 12, promoCode: 'FIX500' }), 'не подходит')
await pay(bob, { plan: 'pro', months: 12, promoCode: 'FIX500' })
payment = (await paymentsOf('bob@promo.test'))[0]
check('FIX500 на год «Профи»: 8900 − 500', payment.amount === 840000 && payment.discount === 50000 && payment.status === 'succeeded', payment)

// ---------- 100%: без оплаты, лимит применений
const carl = await account('carl@promo.test')
const before = (await ykLog()).log.length
r = await carl.post('/api/v1/billing/checkout', { plan: 'start', months: 1, promoCode: 'FREE100' })
check('100%: сразу в кабинет', r.status === 200 && r.data.redirectUrl === '/kabinet/podpiska?promo=activated', r.data)
check('100%: ЮKassa не вызывалась', (await ykLog()).log.length === before)
payment = (await paymentsOf('carl@promo.test'))[0]
check('100%: платёж 0 ₽, оплачен', payment.amount === 0 && payment.provider === 'promo' && payment.status === 'succeeded', payment)
const s = await readStore()
const carlId = s.users.find((user) => user.email === 'carl@promo.test').id
check('100%: тариф включён', s.subscriptions.some((sub) => sub.userId === carlId && sub.plan === 'start' && sub.status === 'active'))
check('кабинет: «включён по промокоду»', (await carl.page('/kabinet/podpiska?promo=activated')).text.includes('Тариф включён по промокоду'))
const dina = await account('dina@promo.test')
check400('лимит применений исчерпан', await dina.post('/api/v1/billing/checkout', { plan: 'start', months: 1, promoCode: 'FREE100' }), 'больше не действует')

// ---------- первая оплата
r = await pay(dina, { plan: 'start', months: 1, promoCode: 'NEWBIE' })
payment = (await paymentsOf('dina@promo.test')).at(-1)
check('NEWBIE новому клиенту: −10%', payment.amount === 35100 && payment.status === 'succeeded', payment)

// ---------- автопродление: скидка только на первый платёж
const eva = await account('eva@promo.test')
await pay(eva, { plan: 'pro', months: 1, promoCode: 'SPRING20', autoRenew: true })
payment = (await paymentsOf('eva@promo.test'))[0]
call = await lastPaymentCall()
check('со скидкой и сохранением карты', payment.amount === 71200 && call.body.save_payment_method === true, { payment, body: call.body })
text = (await eva.page('/kabinet/podpiska')).text
check('автопродление — по полной цене', text.includes('Автопродление включено') && text.includes('спишем 890'), text.match(/Автопродление включено.{0,200}/)?.[0])

// ---------- счёт организации со скидкой
const org = await account('org@promo.test')
await org.post('/api/v1/account/company', { name: 'ООО «Ромашка»', inn: '7707083893', kpp: '773601001', address: '117997, г. Москва, ул. Вавилова, д. 19' })
r = await org.post('/api/v1/billing/checkout', { plan: 'pro', months: 12, method: 'invoice', promoCode: 'SPRING20' })
payment = (await paymentsOf('org@promo.test'))[0]
check('счёт со скидкой', r.status === 200 && payment.provider === 'invoice' && payment.amount === 712000, payment)
text = (await org.page(`/dokument/schet/${payment.id}`)).text
check('в счёте — промокод и сумма', text.includes('промокоду SPRING20') && text.includes('7 120,00'), text.match(/Предоставление.{0,200}/)?.[0])
check('неоплаченный счёт применение не засчитал', (await promoOf('SPRING20')).usedCount === 2, await promoOf('SPRING20'))

// ---------- админка
text = (await admin.page('/admin/promokody')).text
check('админка: коды, применения, заметка', text.includes('SPRING20') && text.includes('весенняя рассылка') && text.includes('1 из 1') && text.includes('исчерпан') && text.includes('выключен'), text.slice(0, 300))
check('админка: удалить применённый — нельзя', (await admin.post('/api/v1/admin/promo', { action: 'delete', code: 'SPRING20' })).status === 409)
check('админка: удалить неприменённый', (await admin.post('/api/v1/admin/promo', { action: 'delete', code: 'OLD' })).status === 200 && !(await promoOf('OLD')))
check('админка: платёж с промокодом', (await admin.page('/admin/platezhi')).text.includes('SPRING20: −178'))
check('оферта: про промокоды', (await admin.page('/dokumenty/oferta')).text.includes('промокоды на скидку'))

finish()
