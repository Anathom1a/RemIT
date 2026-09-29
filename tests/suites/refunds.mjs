// Возвраты из админки: частичный и полный, чек возврата, отключение подписки,
// ограничения, досинхронизация проводимого возврата, второй чек после возврата.
import { checker, session, sleep } from '../lib/http.mjs'
import { editStore, readStore } from '../lib/store.mjs'
import { mailsTo } from '../lib/mail.mjs'

const B = process.env.BASE
const YK = process.env.YOOKASSA_URL
const { check, finish } = checker()
const ykLog = async () => (await fetch(YK + '/__log')).json()
const ykSet = (body) => fetch(YK + '/__set', { method: 'POST', body: JSON.stringify(body) })
const jobs = async () => (await (await fetch(B + '/api/v1/billing/jobs', { method: 'POST', headers: { authorization: 'Bearer svc-pay' } })).json()).report

async function paidAccount(email, n, plan = 'pro') {
  const who = session(B, `10.40.0.${n}`)
  await who.post('/api/v1/auth/register', { email, password: 'Passw0rd!x', name: 'Тест' })
  const r = await who.post('/api/v1/billing/checkout', { plan, months: 1 })
  await fetch(r.data.redirectUrl, { redirect: 'manual' })
  await who.get('/kabinet/podpiska') // досинхронизация статуса
  return who
}
const paymentOf = async (email) => {
  const s = await readStore()
  const user = s.users.find((item) => item.email === email)
  return s.payments.find((payment) => payment.userId === user.id)
}
const activeSub = async (email) => {
  const s = await readStore()
  const user = s.users.find((item) => item.email === email)
  return s.subscriptions.find((sub) => sub.userId === user.id && sub.status === 'active' && new Date(sub.expiresAt) > new Date())
}

const admin = session(B, '10.40.0.1')
await admin.post('/api/v1/auth/register', { email: 'admin@remit.su', password: 'AdminPass123', name: 'A' })
const refund = (paymentId, amount, extra = {}) => admin.post('/api/v1/admin/payments', { paymentId, action: 'refund', amount, reason: 'Не подошёл сервис', ...extra })

// ---------- частичный возврат: подписка остаётся
const anna = await paidAccount('anna@refund.test', 2)
let payment = await paymentOf('anna@refund.test')
check('оплата прошла', payment.status === 'succeeded' && Boolean(await activeSub('anna@refund.test')), payment)
check('не-админ вернуть не может', [401, 403].includes((await anna.post('/api/v1/admin/payments', { paymentId: payment.id, action: 'refund', amount: '1' })).status))
let r = await refund(payment.id, '300', { cancelSubscription: false })
check('частичный возврат', r.status === 200 && r.data.payment.refunds[0].status === 'succeeded' && r.data.payment.refunds[0].amount === 30000, r.data)
let log = await ykLog()
let call = log.log.filter((entry) => entry.path === '/refunds').at(-1)
check('в ЮKassa: сумма, платёж, причина', call.body.amount.value === '300.00' && call.body.payment_id === payment.providerPaymentId && call.body.description === 'Не подошёл сервис', call.body)
check('чек возврата: предоплата, НДС, почта', call.body.receipt.items[0].payment_mode === 'full_prepayment' && call.body.receipt.items[0].amount.value === '300.00' && call.body.receipt.customer.email === 'anna@refund.test', call.body.receipt)
check('подписка осталась', Boolean(await activeSub('anna@refund.test')))
await sleep(300)
check('письмо о возврате', mailsTo('anna@refund.test').some((mail) => mail.subject.includes('возврат оформлен')), mailsTo('anna@refund.test').map((mail) => mail.subject))
check('больше остатка — нельзя', (await refund(payment.id, '600')).status === 400)
check('ноль — нельзя', (await refund(payment.id, '0')).status === 400)

// ---------- возврат остатка с отключением подписки
r = await refund(payment.id, '590', { cancelSubscription: true })
check('возврат остатка', r.status === 200 && r.data.payment.refunds.length === 2, r.data)
check('подписка отключена', !(await activeSub('anna@refund.test')))
check('всё уже вернули — больше нельзя', (await refund(payment.id, '1')).status === 400)
let text = (await anna.page('/kabinet/podpiska')).text
check('кабинет: «возвращено 890 ₽»', text.includes('возвращено 890'), text.slice(0, 100))
text = (await admin.page('/admin/platezhi')).text
check('админка: сумма возврата', text.includes('возвращено 890'))
// Возвращено целиком — второго чека не будет.
await editStore((s) => { s.payments.find((item) => item.id === payment.id).serviceEndsAt = new Date(Date.now() - 1000).toISOString() })
await jobs()
check('второй чек после полного возврата не выдаётся', (await paymentOf('anna@refund.test')).settlement === 'skipped')

// ---------- возврат ещё проводится — досинхронизация
await paidAccount('bob@refund.test', 3)
payment = await paymentOf('bob@refund.test')
await ykSet({ refundStatus: 'pending' })
r = await refund(payment.id, '200', { cancelSubscription: false })
check('возврат проводится', r.status === 200 && r.data.payment.refunds[0].status === 'pending', r.data)
check('админка: «проводится»', (await admin.page('/admin/platezhi')).text.includes('(проводится)'))
await ykSet({ refundStatus: '', refundSettle: true })
await jobs()
check('досинхронизация: возврат проведён', (await paymentOf('bob@refund.test')).refunds[0].status === 'succeeded')
// Частичный возврат: второй чек — на остаток.
await editStore((s) => { s.payments.find((item) => item.id === payment.id).serviceEndsAt = new Date(Date.now() - 1000).toISOString() })
await jobs()
log = await ykLog()
const settle = log.log.filter((entry) => entry.path === '/receipts').at(-1)
check('второй чек — на остаток 690 ₽', settle?.body.settlements[0].amount.value === '690.00' && settle.body.payment_id === payment.providerPaymentId, settle?.body)

// ---------- возврат после второго чека — чек возврата «полный расчёт»
r = await refund(payment.id, '100', { cancelSubscription: false })
call = (await ykLog()).log.filter((entry) => entry.path === '/refunds').at(-1)
check('после полного расчёта чек возврата — полный расчёт', r.status === 200 && call.body.receipt.items[0].payment_mode === 'full_payment', call.body.receipt)

finish()
