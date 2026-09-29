import { readStore } from '../lib/store.mjs'
const B = process.env.BASE
const SERVICE = { Authorization: 'Bearer dev-service-token' }
const jar = new Map()
const ok = [], fail = []
const check = (label, cond, extra = '') => (cond ? ok : fail).push(`${label} ${extra}`)
const DAY = 86400000

async function call(who, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: jar.get(who) ?? '', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) jar.set(who, set.map((c) => c.split(';')[0]).join('; '))
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}
const hb = (id, conns) => call('-', '/api/heartbeat', { method: 'POST', body: { id, uuid: `uuid-${id}`, conns } })
const audit = (id, conn, peer) => call('-', '/api/audit/conn', { method: 'POST', body: { id, conn_id: conn, action: 'new', peer_id: peer } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- подготовка: оператор A на «Профи» с привязанным компьютером C1
await call('A', '/api/v1/auth/register', { method: 'POST', body: { email: 'op@example.com', password: 'Password123', name: 'Оператор' } })
await hb('111111111', [])
let r = await call('A', '/api/v1/devices', { method: 'POST', body: { rustdeskId: '111111111' } })
check('компьютер оператора привязан', r.status === 200, r.status)

r = await call('A', '/api/v1/billing/checkout', { method: 'POST', body: { plan: 'pro', months: 1 } })
check('заказ «Профи» на месяц', r.status === 200, JSON.stringify(r.data).slice(0, 100))
r = await call('-', '/api/v1/billing/confirm', { method: 'POST', body: { paymentId: r.data.paymentId }, headers: SERVICE })
check('оплата подтверждена', r.status === 200 && r.data.subscription?.plan === 'pro', r.data.subscription?.plan)
const proExpires = r.data.subscription.expiresAt

// --- лимит одновременных сессий: 3 на «Профи»
for (const host of ['200000001', '200000002', '200000003', '200000004']) {
  await audit(host, 1, '111111111')
  await sleep(5)
}
const cut = {}
for (const host of ['200000001', '200000002', '200000003', '200000004']) {
  const res = await hb(host, [1])
  cut[host] = res.data.disconnect ?? []
}
check('первые три сессии не тронуты', ['200000001', '200000002', '200000003'].every((h) => cut[h].length === 0), JSON.stringify(cut))
check('четвёртая сессия разорвана', JSON.stringify(cut['200000004']) === '[1]', JSON.stringify(cut['200000004']))
r = await hb('200000001', [1])
check('старая сессия живёт и дальше', !(r.data.disconnect ?? []).length, JSON.stringify(r.data.disconnect))

// --- уведомление в клиенте оператора
r = await call('-', '/api/v1/client/state', { method: 'POST', body: { id: '111111111', uuid: 'uuid-111111111' } })
check('клиент: предупреждение', r.data.alert === true && r.data.limitCut?.count === 1, JSON.stringify(r.data.limitCut))
check('клиент: причина в тексте', /Подключение прервано: на тарифе «Профи» одновременно доступно 3 сессии/.test(r.data.message), r.data.message)
check('клиент: ссылка на переход', r.data.linkText === 'Перейти на «Бизнес»' && r.data.linkUrl.endsWith('/kabinet/podpiska?upgrade=business#plan-business'), `${r.data.linkText} ${r.data.linkUrl}`)

// --- кабинет
r = await call('A', '/kabinet')
check('кабинет: баннер о нехватке сессий', r.data.includes('Не хватило одновременных сессий') && r.data.includes('Доплата — только за оставшиеся дни'))
r = await call('A', '/kabinet/podpiska?upgrade=business')
check('подписка: баннер', r.data.includes('Не хватило одновременных сессий'))
check('подписка: «ваш тариф» и «рекомендуем»', r.data.includes('ваш тариф') && r.data.includes('рекомендуем'))
check('подписка: кнопка доплаты', r.data.includes('Перейти сейчас — доплата'))
check('подписка: младший тариф — после окончания', r.data.includes('после окончания текущей подписки'))
check('подписка: продление своего тарифа', r.data.includes('Продлить на месяц'))

// --- расчёт доплаты
r = await call('A', '/api/v1/billing/upgrade?plan=business')
const days = r.data.remainingDays
const expected = Math.max(100, Math.ceil(Math.round((160000 * days) / 30) / 100) * 100)
check('расчёт: по месячным ценам', r.data.basis === 'month', r.data.basis)
check('расчёт: сумма', r.data.amount === expected, `${r.data.amount} vs ${expected} за ${days} дн.`)
check('расчёт: до конца подписки', r.data.until === proExpires, r.data.until)
for (const [plan, label] of [['start', 'младший'], ['pro', 'тот же'], ['corporate', 'договорной']]) {
  r = await call('A', `/api/v1/billing/upgrade?plan=${plan}`)
  check(`расчёт: ${label} тариф отклонён`, r.status === 400, `${r.status} ${r.data.error}`)
}

// --- покупка другого тарифа поверх подписки не сжигает дни
r = await call('A', '/api/v1/billing/checkout', { method: 'POST', body: { plan: 'business', months: 1 } })
check('покупка старшего поверх — отказ с подсказкой', r.status === 400 && /доплатой/.test(r.data.error), r.data.error)
r = await call('A', '/api/v1/billing/checkout', { method: 'POST', body: { plan: 'start', months: 1 } })
check('покупка младшего поверх — отказ', r.status === 400 && /после окончания срока/.test(r.data.error), r.data.error)

// --- повышение
r = await call('A', '/api/v1/billing/upgrade', { method: 'POST', body: { plan: 'business' } })
check('доплата заказана', r.status === 200 && r.data.amount === expected, JSON.stringify(r.data).slice(0, 120))
const upPayment = r.data.paymentId
r = await call('A', `/kabinet/podpiska?schet=${upPayment}`)
check('счёт на доплату описан словами', r.data.includes('за переход на тариф «Бизнес» до'))
r = await call('-', '/api/v1/billing/confirm', { method: 'POST', body: { paymentId: upPayment }, headers: SERVICE })
check('после оплаты тариф «Бизнес»', r.data.subscription?.plan === 'business', r.data.subscription?.plan)
check('срок не изменился', r.data.subscription?.expiresAt === proExpires, r.data.subscription?.expiresAt)
r = await call('-', '/api/v1/billing/confirm', { method: 'POST', body: { paymentId: upPayment }, headers: SERVICE })
check('повторное подтверждение ничего не ломает', r.data.subscription?.plan === 'business' && r.data.subscription?.expiresAt === proExpires)

r = await hb('200000004', [1])
check('после повышения четвёртая сессия проходит', !(r.data.disconnect ?? []).length, JSON.stringify(r.data.disconnect))
r = await call('A', '/kabinet/podpiska')
check('история: повышение', r.data.includes('повышение до') && r.data.includes('Профи → Бизнес'))

// --- годовая подписка считается по годовым ценам
await call('B', '/api/v1/auth/register', { method: 'POST', body: { email: 'year@example.com', password: 'Password123', name: 'Годовой' } })
r = await call('B', '/api/v1/billing/checkout', { method: 'POST', body: { plan: 'pro', months: 12 } })
await call('-', '/api/v1/billing/confirm', { method: 'POST', body: { paymentId: r.data.paymentId }, headers: SERVICE })
r = await call('B', '/api/v1/billing/upgrade?plan=business')
const yExpected = Math.max(100, Math.ceil(Math.round((1600000 * r.data.remainingDays) / 365) / 100) * 100)
check('годовая: базис год', r.data.basis === 'year', r.data.basis)
check('годовая: сумма', r.data.amount === yExpected, `${r.data.amount} vs ${yExpected} за ${r.data.remainingDays} дн.`)

// --- пробный период: доплаты нет, покупка обычная
await call('C', '/api/v1/auth/register', { method: 'POST', body: { email: 'trial@example.com', password: 'Password123', name: 'Проба' } })
await call('ADM', '/api/v1/auth/register', { method: 'POST', body: { email: 'admin@remit.su', password: 'Password123', name: 'Админ' } })
const users = await call('ADM', '/api/v1/admin/users?q=trial@example.com')
const trialUserId = users.data.users?.[0]?.id
r = await call('ADM', '/api/v1/admin/subscriptions', { method: 'POST', body: { userId: trialUserId, action: 'trial', plan: 'pro', days: 14 } })
check('пробный выдан', r.status === 200, r.status)
r = await call('C', '/api/v1/billing/upgrade?plan=business')
check('пробный: доплата не предлагается', r.status === 400, r.data.error)
r = await call('C', '/api/v1/billing/checkout', { method: 'POST', body: { plan: 'business', months: 1 } })
check('пробный: обычная покупка разрешена', r.status === 200, r.status)

// --- устройство без аккаунта: лимит 1, ссылка на тарифы
await audit('300000001', 1, '999999999')
await sleep(5)
await audit('300000002', 1, '999999999')
await hb('300000001', [1])
r = await hb('300000002', [1])
check('без аккаунта: вторая сессия разорвана', JSON.stringify(r.data.disconnect) === '[1]', JSON.stringify(r.data.disconnect))
r = await call('-', '/api/v1/client/state', { method: 'POST', body: { id: '999999999' } })
check('без аккаунта: ссылка на тарифы', r.data.alert === true && r.data.linkText === 'Посмотреть тарифы', r.data.linkText)

// --- обычное состояние без разрывов
r = await call('-', '/api/v1/client/state', { method: 'POST', body: { id: '200000001', uuid: 'uuid-200000001' } })
check('без разрывов предупреждения нет', r.data.alert === false && r.data.limitCut === null, JSON.stringify({ alert: r.data.alert, cut: r.data.limitCut }))

console.log('OK:\n  ' + ok.join('\n  '))
if (fail.length) { console.log('\nПРОВАЛЫ:\n  ' + fail.join('\n  ')); process.exit(1) }
console.log(`\nВсе проверки прошли: ${ok.length}`)
