// Места в команде: тариф владельца для участников с местом, автоматическое
// место при принятии приглашения, лимит мест, роли (администратор), общий
// пул одновременных сессий, своя подписка участника, отмена тарифа владельца.
import { checker, session, sleep } from '../lib/http.mjs'
import { readStore } from '../lib/store.mjs'

const B = process.env.BASE
const SERVICE = { authorization: 'Bearer svc-seats' }
const { check, finish } = checker()
const anon = session(B, '10.80.0.99')
const hb = (id, conns) => anon.post('/api/heartbeat', { id, uuid: `uuid-${id}`, conns })
const audit = (id, conn, peer) => anon.post('/api/audit/conn', { id, conn_id: conn, action: 'new', peer_id: peer })
const clientPlan = async (device) => (await anon.post('/api/v1/client/state', { id: device, uuid: `uuid-${device}` })).data.plan
const team = (who, body) => who.post('/api/v1/team', body)
const userId = async (email) => (await readStore()).users.find((user) => user.email === email).id

let n = 0
async function person(email, device) {
  const who = session(B, `10.80.0.${++n}`)
  await who.post('/api/v1/auth/register', { email, password: 'Passw0rd!x', name: email.split('@')[0] })
  await hb(device, [])
  await who.post('/api/v1/devices', { rustdeskId: device })
  return who
}

const admin = await person('admin@remit.su', '110000000')
const owner = await person('owner@seats.test', '110000001')
const m1 = await person('m1@seats.test', '110000002')
const m2 = await person('m2@seats.test', '110000003')
const m3 = await person('m3@seats.test', '110000004')

// ---------- команда без тарифа: мест нет
await team(owner, { action: 'create', name: 'Отдел ИТ' })
for (const email of ['m1@seats.test', 'm2@seats.test', 'm3@seats.test']) await team(owner, { action: 'invite', email })
await team(m1, { action: 'accept' })
let text = (await owner.page('/kabinet/komanda')).text
check('без тарифа: мест нет', text.includes('Мест пока нет') && text.includes('без места'), text.slice(0, 300))
let r = await team(owner, { action: 'seat', userId: await userId('m1@seats.test'), seat: true })
check('без тарифа место не выдать', r.status === 409 && r.data.error.includes('нет оплаченного тарифа'), r.data)
check('участник на бесплатном', (await clientPlan('110000002')) === 'free')

// ---------- владелец оплатил «Профи»: 3 места, общий пул 3 сессий
r = await owner.post('/api/v1/billing/checkout', { plan: 'pro', months: 1 })
r = await anon.post('/api/v1/billing/confirm', { paymentId: r.data.paymentId }, SERVICE)
check('«Профи» у владельца', r.status === 200 && r.data.subscription.plan === 'pro', r.data)
r = await team(owner, { action: 'seat', userId: await userId('m1@seats.test'), seat: true })
check('место участнику', r.status === 200, r.data)
check('участник с местом — на «Профи»', (await clientPlan('110000002')) === 'pro')
await team(m2, { action: 'accept' })
check('принял приглашение — место сразу', (await clientPlan('110000003')) === 'pro')
await team(m3, { action: 'accept' })
check('мест нет — принял без места', (await clientPlan('110000004')) === 'free')
text = (await owner.page('/kabinet/komanda')).text
check('кабинет: «Места: 3 из 3»', text.includes('Места: 3 из 3') && text.includes('3 одновременных сессий — общие'), text.match(/Места.{0,200}/)?.[0])
r = await team(owner, { action: 'seat', userId: await userId('m3@seats.test'), seat: true })
check('сверх мест — отказ', r.status === 409 && r.data.error.includes('Все места заняты: 3 из 3'), r.data)
r = await team(m1, { action: 'seat', userId: await userId('m3@seats.test'), seat: true })
check('участник места не раздаёт', r.status === 403, r.data)
text = (await m1.page('/kabinet/podpiska')).text
check('подписка участника: тариф команды', text.includes('Вы работаете по тарифу «Профи» команды «Отдел ИТ»'), text.slice(0, 300))
check('кабинет участника: тариф команды', (await m1.page('/kabinet')).text.includes('Тариф «Профи» команды «Отдел ИТ»'))
check('веб-клиент участнику с местом доступен', (await m1.page('/kabinet/veb-klient')).text.includes('Открыть веб-клиент'))

// ---------- администратор
r = await team(owner, { action: 'role', userId: await userId('m3@seats.test'), role: 'admin' })
check('владелец назначил администратора', r.status === 200, r.data)
r = await team(m3, { action: 'seat', userId: await userId('m2@seats.test'), seat: false })
check('администратор забрал место', r.status === 200 && (await clientPlan('110000003')) === 'free', r.data)
r = await team(m3, { action: 'seat', userId: await userId('m3@seats.test'), seat: true })
check('и взял себе', r.status === 200 && (await clientPlan('110000004')) === 'pro', r.data)
r = await team(m3, { action: 'group-create', name: 'Склад' })
check('администратор ведёт группы', r.status === 200, r.data)
check('администратор не исключит владельца', (await team(m3, { action: 'remove', userId: await userId('owner@seats.test') })).status === 400)
check('администратор не меняет роли', (await team(m3, { action: 'role', userId: await userId('m1@seats.test'), role: 'admin' })).status === 403)
check('администратор не распустит команду', (await team(m3, { action: 'disband' })).status === 403)

// ---------- общий пул: владелец, m1, m3 — 3 сессии на всех
await audit('220000001', 1, '110000001') // владелец
await sleep(5)
await audit('220000002', 1, '110000002') // m1
await sleep(5)
await audit('220000003', 1, '110000004') // m3
await sleep(5)
await audit('220000004', 1, '110000002') // m1, четвёртая в пуле
await sleep(5)
await audit('220000005', 1, '110000003') // m2 без места — свой бесплатный лимит
const cut = {}
for (const host of ['220000001', '220000002', '220000003', '220000004', '220000005']) {
  cut[host] = (await hb(host, [1])).data.disconnect ?? []
}
check('три сессии команды живут', ['220000001', '220000002', '220000003'].every((host) => cut[host].length === 0), cut)
check('четвёртая в пуле команды разорвана', JSON.stringify(cut['220000004']) === '[1]', cut)
check('участник без места — не в пуле', cut['220000005'].length === 0, cut)
r = await anon.post('/api/v1/client/state', { id: '110000001', uuid: 'uuid-110000001' })
check('клиент владельца: 3 из 3 заняты', /3/.test(JSON.stringify(r.data)), r.data.message)

// ---------- своя подписка участника
const m2id = await userId('m2@seats.test')
await admin.post('/api/v1/admin/subscriptions', { action: 'grant', userId: m2id, plan: 'business', months: 1 })
check('своя подписка важнее', (await clientPlan('110000003')) === 'business')
text = (await owner.page('/kabinet/komanda')).text
check('кабинет: «свой тариф»', text.includes('свой тариф «Бизнес»'), text.match(/m2@seats.test.{0,120}/)?.[0])

// ---------- подписку владельца отменили — места пропали
await admin.post('/api/v1/admin/subscriptions', { action: 'cancel', userId: await userId('owner@seats.test') })
check('без тарифа владельца участник на бесплатном', (await clientPlan('110000002')) === 'free')
check('владелец тоже', (await clientPlan('110000001')) === 'free')
check('у своей подписки ничего не меняется', (await clientPlan('110000003')) === 'business')

finish()
