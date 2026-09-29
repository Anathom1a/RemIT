// Автопродление и чеки против заглушки ЮKassa (tests/fakes/yookassa.mjs).
import fs from 'node:fs'
import { editStore, readStore } from '../lib/store.mjs'
import { session } from '../lib/http.mjs'

const B = process.env.BASE
const YK = process.env.YOOKASSA_URL
const MAIL = process.env.MAIL_DIR
const SERVICE = 'svc-pay'
const DAY = 86400000
const ok = [], fail = []
const check = (label, cond, extra = '') => (cond ? ok : fail).push(`${label} ${typeof extra === 'object' ? JSON.stringify(extra).slice(0, 400) : extra}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ykLog = async () => (await fetch(YK + '/__log')).json()
const ykSet = (body) => fetch(YK + '/__set', { method: 'POST', body: JSON.stringify(body) })
const jobs = async () => (await (await fetch(B + '/api/v1/billing/jobs', { method: 'POST', headers: { authorization: `Bearer ${SERVICE}` } })).json()).report

function decodeWords(value) {
  return value.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_, enc, text) =>
    enc.toLowerCase() === 'b'
      ? Buffer.from(text, 'base64').toString('utf8')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'),
  )
}
const mails = (to) =>
  fs.existsSync(MAIL)
    ? fs.readdirSync(MAIL).sort().map((f) => fs.readFileSync(`${MAIL}/${f}`, 'utf8'))
        .filter((raw) => raw.includes(`To: ${to}`))
        .map((raw) => {
          const head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ')
          return decodeWords((head.match(/^Subject: (.*)$/m)?.[1] ?? '').replace(/\?=\s+=\?/g, '?==?'))
        })
    : []

async function account(email, n) {
  const ctx = session(B, `10.77.0.${n}`)
  const r = await ctx.post('/api/v1/auth/register', { email, password: 'Passw0rd!x', name: 'Тест' })
  if (r.status !== 200) throw new Error('register ' + email + ' ' + r.text)
  return ctx
}
async function buy(ctx, body) {
  const r = await ctx.post('/api/v1/billing/checkout', body)
  const data = r.data ?? {}
  if (!data.redirectUrl) return { error: data.error, status: r.status }
  // «Платим» на странице ЮKassa; возврат в кабинет — без перехода.
  await fetch(data.redirectUrl, { redirect: 'manual' })
  return data
}
const subOf = async (email) => {
  const s = await readStore()
  const user = s.users.find((u) => u.email === email)
  return s.subscriptions.filter((x) => x.userId === user.id).sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
}
const paymentsOf = async (email) => {
  const s = await readStore()
  const user = s.users.find((u) => u.email === email)
  return s.payments.filter((p) => p.userId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// ---------- 1. Оплата с согласием на автопродление
const anna = await account('anna@pay.test', 1)
let page = await anna.page('/kabinet/podpiska')
const boxes = page.html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []
check('отметка автопродления видна и снята', boxes.length === 1 && !/checked/.test(boxes[0]), boxes)

let r = await buy(anna, { plan: 'pro', months: 1, autoRenew: true })
let log = await ykLog()
let create = log.log.filter((l) => l.path === '/payments').at(-1)
check('платёж с сохранением карты', create.body.save_payment_method === true && !create.body.payment_method_id, create.body)
check('чек в платеже: НДС 11, предоплата, почта', create.body.receipt?.items?.[0]?.vat_code === 11 && create.body.receipt.items[0].payment_mode === 'full_prepayment' && create.body.receipt.customer.email === 'anna@pay.test' && create.body.receipt.items[0].payment_subject === 'service', create.body.receipt)
check('система налогообложения передана', create.body.receipt?.tax_system_code === 2, create.body.receipt)

// Вебхук не пришёл — кабинет досинхронизирует сам.
let html = (await anna.page('/kabinet/podpiska')).text
let sub = (await subOf('anna@pay.test'))[0]
check('подписка включена с автопродлением', sub.autoRenew && sub.paymentMethodId.startsWith('pm_') && sub.paymentMethodTitle === 'Bank card *4444' && sub.renewMonths === 1, sub)
check('кабинет: блок автопродления', html.includes('Автопродление включено') && html.includes('Bank card *4444'))
let pay1 = (await paymentsOf('anna@pay.test'))[0]
check('платёж: оплачен, конец периода, второй чек due', pay1.status === 'succeeded' && pay1.serviceEndsAt === sub.expiresAt && pay1.settlement === 'due' && pay1.saveMethod && pay1.receiptEmail === 'anna@pay.test', pay1)

// ---------- 2. Без согласия карта не сохраняется
const boris = await account('boris@pay.test', 2)
await buy(boris, { plan: 'pro', months: 12 })
create = (await ykLog()).log.filter((l) => l.path === '/payments').at(-1)
check('без отметки save_payment_method нет', !('save_payment_method' in create.body), create.body)
// вебхук на этот раз
const borisPay = (await paymentsOf('boris@pay.test'))[0]
let wh = await fetch(B + '/api/v1/billing/webhook/yookassa', { method: 'POST', body: JSON.stringify({ event: 'payment.succeeded', object: { id: borisPay.providerPaymentId } }) })
check('вебхук принят', wh.status === 200)
sub = (await subOf('boris@pay.test'))[0]
check('подписка без автопродления', sub && !sub.autoRenew && !sub.paymentMethodId, sub)

// ---------- 3. Фискальные данные подтягиваются
let rep = await jobs()
pay1 = (await paymentsOf('anna@pay.test'))[0]
check('чек предоплаты получен', pay1.receipts.length === 1 && pay1.receipts[0].kind === 'prepayment' && pay1.receipts[0].status === 'succeeded' && pay1.receipts[0].fiscalDocumentNumber, pay1.receipts)
html = (await anna.page('/kabinet/podpiska')).text
check('кабинет: ФД и ФП в истории', html.includes(`ФД ${pay1.receipts[0].fiscalDocumentNumber}`) && html.includes('итоговый чек'))

// ---------- 4. Предупреждение за 3 дня
const annaId = (await readStore()).users.find((u) => u.email === 'anna@pay.test').id
await editStore((s) => {
  const x = s.subscriptions.find((y) => y.userId === annaId)
  x.expiresAt = new Date(Date.now() + 3.5 * DAY).toISOString()
})
rep = await jobs()
check('предупреждение отправлено', rep.notices === 1 && rep.charged === 0, rep)
await sleep(300)
check('письмо-предупреждение', mails('anna@pay.test').some((m) => m.includes('скоро продлим')), mails('anna@pay.test'))
rep = await jobs()
check('второй раз не предупреждаем', rep.notices === 0, rep)

// ---------- 5. Автосписание
await editStore((s) => {
  const x = s.subscriptions.find((y) => y.userId === annaId)
  x.expiresAt = new Date(Date.now() + 10 * 3600000).toISOString()
})
const before = (await subOf('anna@pay.test'))[0].expiresAt
// Два запуска одновременно: списание одно.
const [rA, rB] = await Promise.all([jobs(), jobs()])
log = await ykLog()
let recurring = log.log.filter((l) => l.path === '/payments' && l.body.payment_method_id)
check('одно автосписание', recurring.length === 1 && (rA.charged + rB.charged) >= 1, { n: recurring.length, rA, rB })
check('автосписание с чеком и сохранённой картой', recurring[0]?.body.payment_method_id === sub.paymentMethodId || recurring[0]?.body.payment_method_id?.startsWith('pm_'), recurring[0]?.body)
check('чек автосписания: предоплата', recurring[0]?.body.receipt?.items?.[0]?.payment_mode === 'full_prepayment')
sub = (await subOf('anna@pay.test'))[0]
const expected = new Date(before); expected.setMonth(expected.getMonth() + 1)
check('подписка продлена на месяц от конца', sub.expiresAt === expected.toISOString() && sub.autoRenew && sub.renewAttempts === 0, { sub, expected })
const recPay = (await paymentsOf('anna@pay.test')).find((p) => p.recurring)
check('платёж автопродления записан', recPay?.status === 'succeeded' && recPay.subscriptionId === sub.id && recPay.amount === 89000, recPay)
await sleep(300)
check('письмо о продлении', mails('anna@pay.test').some((m) => m.includes('подписка продлена')))
rep = await jobs()
check('повторный запуск не списывает', (await ykLog()).log.filter((l) => l.path === '/payments' && l.body.payment_method_id).length === 1, rep)

// ---------- 6. Отказ банка: ещё две попытки, потом выключаем
await ykSet({ declineReason: 'insufficient_funds' })
await editStore((s) => {
  const x = s.subscriptions.find((y) => y.userId === annaId && y.status === 'active')
  x.expiresAt = new Date(Date.now() + 20 * 3600000).toISOString()
})
rep = await jobs()
sub = (await subOf('anna@pay.test'))[0]
check('отказ 1: повтор через 12 ч', rep.failed === 1 && sub.autoRenew && sub.renewAttempts === 1 && sub.renewNextAt && sub.renewError.includes('недостаточно'), sub)
rep = await jobs()
check('до повтора не трогаем', rep.failed === 0 && rep.charged === 0, rep)
check('кабинет: сообщение об отказе', (await anna.page('/kabinet/podpiska')).text.includes('Не удалось списать'))
await editStore((s) => { s.subscriptions.find((y) => y.id === sub.id).renewNextAt = new Date(Date.now() - 1000).toISOString() })
rep = await jobs()
sub = (await subOf('anna@pay.test'))[0]
check('отказ 2', sub.renewAttempts === 2 && sub.autoRenew, sub)
await editStore((s) => { s.subscriptions.find((y) => y.id === sub.id).renewNextAt = new Date(Date.now() - 1000).toISOString() })
rep = await jobs()
sub = (await subOf('anna@pay.test'))[0]
check('отказ 3: автопродление выключено', !sub.autoRenew && !sub.paymentMethodId && sub.renewError.includes('недостаточно'), sub)
await sleep(300)
check('письма об отказах', mails('anna@pay.test').filter((m) => m.includes('не удалось продлить')).length === 3, mails('anna@pay.test'))
const declined = (await ykLog()).log.filter((l) => l.path === '/payments' && l.body.payment_method_id)
check('три разные попытки (ключи)', new Set(declined.map((l) => l.key)).size === 4, declined.map((l) => l.key))
await ykSet({ declineReason: '' })

// ---------- 7. Карта истекла — сразу выключаем
const vera = await account('vera@pay.test', 3)
await buy(vera, { plan: 'business', months: 1, autoRenew: true })
await vera.get('/kabinet/podpiska')
const veraId = (await readStore()).users.find((u) => u.email === 'vera@pay.test').id
await ykSet({ declineReason: 'card_expired' })
await editStore((s) => { s.subscriptions.find((y) => y.userId === veraId).expiresAt = new Date(Date.now() + 5 * 3600000).toISOString() })
rep = await jobs()
sub = (await subOf('vera@pay.test'))[0]
check('card_expired: выключено с первой попытки', !sub.autoRenew && sub.renewError.includes('истёк'), sub)
await ykSet({ declineReason: '' })

// ---------- 8. Сервер лежал: подписка кончилась вчера — догоняем
const gleb = await account('gleb@pay.test', 4)
await buy(gleb, { plan: 'pro', months: 1, autoRenew: true })
await gleb.get('/kabinet/podpiska')
const glebId = (await readStore()).users.find((u) => u.email === 'gleb@pay.test').id
await editStore((s) => { s.subscriptions.find((y) => y.userId === glebId).expiresAt = new Date(Date.now() - DAY).toISOString() })
rep = await jobs()
let glebSubs = (await subOf('gleb@pay.test'))
const active = glebSubs.filter((x) => x.status === 'active' && new Date(x.expiresAt) > new Date())
check('просроченная: продлена новой записью с автопродлением', active.length === 1 && active[0].autoRenew && active[0].paymentMethodId, glebSubs)
check('старая запись закрыта', glebSubs.some((x) => x.status === 'canceled' && !x.autoRenew), glebSubs)
rep = await jobs()
check('больше не списываем', (await paymentsOf('gleb@pay.test')).filter((p) => p.recurring).length === 1, (await paymentsOf('gleb@pay.test')))

// ---------- 9. Второй чек по окончании периода; возврат — без второго чека
await editStore((s) => {
  const p = s.payments.find((x) => x.id === pay1.id)
  p.serviceEndsAt = new Date(Date.now() - 1000).toISOString()
  const b = s.payments.find((x) => x.userId === s.users.find((u) => u.email === 'boris@pay.test').id)
  b.serviceEndsAt = new Date(Date.now() - 1000).toISOString()
})
await fetch(YK + '/__refund', { method: 'POST', body: JSON.stringify({ id: borisPay.providerPaymentId, value: (borisPay.amount / 100).toFixed(2) }) })
rep = await jobs()
log = await ykLog()
const settle = log.log.filter((l) => l.path === '/receipts')
check('второй чек отправлен один', settle.length === 1 && rep.settlements === 1, { settle: settle.length, rep })
const sb = settle[0]?.body
check('второй чек: полный расчёт, зачёт аванса, сумма', sb?.type === 'payment' && sb.items[0].payment_mode === 'full_payment' && sb.settlements[0].type === 'prepayment' && sb.settlements[0].amount.value === '890.00' && sb.payment_id === pay1.providerPaymentId && sb.send === true && sb.customer.email === 'anna@pay.test', sb)
pay1 = (await paymentsOf('anna@pay.test'))[0]
check('платёж: второй чек записан', pay1.settlement === 'sent' && pay1.receipts.some((x) => x.kind === 'settlement' && x.status === 'succeeded'), pay1.receipts)
const borisAfter = (await paymentsOf('boris@pay.test'))[0]
check('возвращённый платёж: второй чек не нужен', borisAfter.settlement === 'skipped', borisAfter)
rep = await jobs()
check('второй чек не дублируется', (await ykLog()).log.filter((l) => l.path === '/receipts').length === 1)

// ---------- 10. Гонка вебхука и досинхронизации: продление одно
const dima = await account('dima@pay.test', 5)
await buy(dima, { plan: 'pro', months: 1 })
const dimaPay = (await paymentsOf('dima@pay.test'))[0]
const body = JSON.stringify({ event: 'payment.succeeded', object: { id: dimaPay.providerPaymentId } })
await Promise.all([1, 2, 3, 4].map(() => fetch(B + '/api/v1/billing/webhook/yookassa', { method: 'POST', body })))
const dimaSubs = (await subOf('dima@pay.test'))
const oneMonth = new Date(dimaSubs[0].startedAt); oneMonth.setMonth(oneMonth.getMonth() + 1)
check('четыре вебхука разом — один месяц', dimaSubs.length === 1 && Math.abs(new Date(dimaSubs[0].expiresAt) - oneMonth) < 5000, dimaSubs)

// ---------- 11. Отключение в кабинете, в админке, при удалении аккаунта
const zina = await account('zina@pay.test', 6)
await buy(zina, { plan: 'pro', months: 1, autoRenew: true })
await zina.get('/kabinet/podpiska')
check('кнопка отключения в кабинете', (await zina.page('/kabinet/podpiska')).text.includes('Отключить автопродление'))
await zina.post('/api/v1/billing/autopay', { action: 'disable' })
sub = (await subOf('zina@pay.test'))[0]
check('отключено из кабинета', !sub.autoRenew && !sub.paymentMethodId && sub.status === 'active', sub)

const admin = await account('admin@remit.su', 7)
const yan = await account('yan@pay.test', 8)
await buy(yan, { plan: 'pro', months: 1, autoRenew: true })
await yan.get('/kabinet/podpiska')
const yanId = (await readStore()).users.find((u) => u.email === 'yan@pay.test').id
r = await admin.post('/api/v1/admin/subscriptions', { action: 'autopay-off', userId: yanId })
check('админ выключил автопродление', r.status === 200 && !(await subOf('yan@pay.test'))[0].autoRenew)
html = (await admin.page('/admin/platezhi')).text
check('админка: автосписание и чеки', html.includes('автосписание') && html.includes('ФД ') && html.includes('Запустить сейчас'))
r = await admin.post('/api/v1/admin/billing-jobs')
check('админ: запуск задач', r.status === 200)

const olga = await account('olga@pay.test', 9)
await buy(olga, { plan: 'pro', months: 1, autoRenew: true })
await olga.get('/kabinet/podpiska')
r = await olga.post('/api/v1/account/delete', { password: 'Passw0rd!x', confirm: true })
const olgaUser = (await readStore()).users.find((u) => u.status === 'deleted')
const olgaSubs = olgaUser ? (await readStore()).subscriptions.filter((x) => x.userId === olgaUser.id) : []
check('удаление аккаунта выключает автопродление', r.status === 200 && olgaSubs.length && olgaSubs.every((x) => !x.autoRenew), { status: r.status, body: r.text, olgaSubs })

// ---------- 12. Оферта и сервисный доступ
const oferta = await (await fetch(B + '/dokumenty/oferta')).text()
check('оферта: раздел автопродления', oferta.includes('Автоматическое продление') && oferta.includes('avtoprodlenie') && oferta.includes('чек полного расчёта'))
check('задачи без токена запрещены', (await fetch(B + '/api/v1/billing/jobs', { method: 'POST' })).status === 403)
check('автопродление без входа', (await fetch(B + '/api/v1/billing/autopay', { method: 'POST', body: '{"action":"disable"}' })).status === 401)

console.log('OK:\n  ' + ok.join('\n  '))
console.log('FAIL:\n  ' + fail.join('\n  '))
console.log(`${ok.length} ok, ${fail.length} fail`)
process.exit(fail.length ? 1 : 0)
