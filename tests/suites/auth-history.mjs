import fs from 'node:fs'
import path from 'node:path'
import { readStore, sql, usingPostgres } from '../lib/store.mjs'
const B = process.env.BASE
const MAIL = process.env.MAIL_DIR
const jar = new Map()
const ok = [], fail = []
const check = (label, cond, extra = '') => (cond ? ok : fail).push(`${label} ${extra}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(who, pathName, { method = 'GET', body, ip = '10.0.0.1', raw = false } = {}) {
  const res = await fetch(B + pathName, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip, cookie: jar.get(who) ?? '' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) jar.set(who, set.map((c) => c.split(';')[0]).join('; '))
  const text = await res.text()
  if (raw) return { status: res.status, text, headers: res.headers }
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data, headers: res.headers }
}
const mails = () => (fs.existsSync(MAIL) ? fs.readdirSync(MAIL).sort().map((f) => fs.readFileSync(path.join(MAIL, f), 'utf8')) : [])
function linkFrom(eml) {
  // В теле письма quoted-printable может переносить строки — склеиваем.
  const flat = eml.replace(/=\r?\n/g, '').replace(/=3D/g, '=')
  return flat.match(/https?:\/\/[^\s"<]+\/vosstanovlenie\/[A-Za-z0-9_-]+/)?.[0]
}

// ---------- регистрация и старая сессия
let r = await call('U', '/api/v1/auth/register', { method: 'POST', body: { email: 'user@example.com', password: 'OldPassword1', name: 'Анна' }, ip: '10.1.0.1' })
check('регистрация', r.status === 200, r.status)
await call('ADM', '/api/v1/auth/register', { method: 'POST', body: { email: 'admin@remit.su', password: 'AdminPass123', name: 'Админ' }, ip: '10.1.0.2' })

// ---------- журнал старше года удаляется (пишем запись прямо в файл хранилища до первого heartbeat)
await sleep(300)
const old = new Date(Date.now() - 400 * 86400000).toISOString()
const oldSession = { key: 'OLD:1', hostId: 'OLD', connId: 1, controllerId: '', subjectKey: 'device:OLD', userId: null, startedAt: old, lastTickAt: old, endedAt: old, seconds: 60, closeReason: 'client' }
if (usingPostgres()) {
  await sql(
    `INSERT INTO conn_sessions (key, host_id, conn_id, controller_id, subject_key, user_id, started_at, last_tick_at, ended_at, seconds, close_reason)
     VALUES ($1, $2, $3, $4, $5, NULL, $6, $6, $6, $7, $8)`,
    [oldSession.key, oldSession.hostId, oldSession.connId, '', oldSession.subjectKey, old, 60, 'client'],
  )
} else {
  const snap = await readStore()
  snap.connSessions = [...(snap.connSessions ?? []), oldSession]
  fs.writeFileSync(process.env.STORE_FILE, JSON.stringify(snap, null, 2))
}
await sleep(50)

// ---------- история: оператор с привязанным компьютером
await call('-', '/api/heartbeat', { method: 'POST', body: { id: '700000001', uuid: 'u1', conns: [] } })
await sleep(500)
const after = (await readStore())
check('журнал старше года удалён', !(after.connSessions ?? []).some((s) => s.key === 'OLD:1'), (after.connSessions ?? []).length)

r = await call('U', '/api/v1/devices', { method: 'POST', body: { rustdeskId: '700000001' } })
check('устройство привязано', r.status === 200, r.status)
// исходящее: с компьютера оператора на чужой; входящее: кто-то к компьютеру оператора
await call('-', '/api/audit/conn', { method: 'POST', body: { id: '800000001', conn_id: 5, action: 'new', peer_id: '700000001' } })
await call('-', '/api/audit/conn', { method: 'POST', body: { id: '700000001', conn_id: 9, action: 'new', peer_id: '900000009' } })
await call('-', '/api/heartbeat', { method: 'POST', body: { id: '800000001', uuid: 'h', conns: [5] } })
await call('-', '/api/audit/conn', { method: 'POST', body: { id: '800000001', conn_id: 5, action: 'close' } })

r = await call('U', '/kabinet/istoriya', { raw: true })
check('история: страница', r.status === 200 && r.text.includes('История подключений'), r.status)
check('история: 7 дней на бесплатном', r.text.includes('За последние <!-- -->7<!-- --> дн.') || /За последние\s*(<!-- -->)?7/.test(r.text))
check('история: обе сессии', r.text.includes('800000001') && r.text.includes('900000009'))
check('история: направления', r.text.includes('вы подключались') && r.text.includes('к вашему устройству'))
check('история: подсказка про тариф', r.text.includes('Нужна история глубже'))

r = await call('U', '/api/v1/history/export', { raw: true })
const csv = r.text
check('выгрузка: тип и имя файла', (r.headers.get('content-type') ?? '').startsWith('text/csv') && /remit-history-/.test(r.headers.get('content-disposition') ?? ''))
const csvBytes = new Uint8Array(await (await fetch(B + '/api/v1/history/export', { headers: { cookie: jar.get('U') } })).arrayBuffer())
check('выгрузка: BOM и «;»', csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf && csv.includes('Начало;Окончание;Длительность, мин'), Array.from(csvBytes.slice(0, 3)))
check('выгрузка: строки и итог', csv.includes('исходящее') && csv.includes('входящее') && /Итого;;[0-9,]+;/.test(csv), csv.split('\r\n').length)
r = await call('-', '/api/v1/history/export', { raw: true })
check('выгрузка: без входа — 401', r.status === 401, r.status)

// ---------- тексты тарифов
r = await call('-', '/tarify', { raw: true })
check('тарифы: нет общей адресной книги', !r.text.includes('Общая адресная книга') && r.text.includes('Выгрузка журнала в Excel'))
check('тарифы: нет Telegram', !r.text.includes('Telegram'))
r = await call('-', '/', { raw: true })
check('главная: нет «24/7 в Telegram»', !r.text.includes('поддержка в Telegram'))

// ---------- перебор паролей
for (let i = 0; i < 5; i++) {
  r = await call('X', '/api/v1/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'wrong' + i }, ip: '10.2.0.1' })
}
check('5 неудач — 401', r.status === 401, r.status)
r = await call('X', '/api/v1/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'OldPassword1' }, ip: '10.2.0.2' })
check('6-я попытка с верным паролем — 429 (лимит на почту)', r.status === 429 && Number(r.headers.get('retry-after')) > 0, `${r.status} ${r.data.error}`)
r = await call('X', '/api/v1/auth/login', { method: 'POST', body: { email: 'admin@remit.su', password: 'AdminPass123' }, ip: '10.2.0.1' })
check('другая почта с того же адреса входит', r.status === 200, r.status)
for (let i = 0; i < 30; i++) {
  await call('Y', '/api/v1/auth/login', { method: 'POST', body: { email: `nobody${i}@example.com`, password: 'x' }, ip: '10.3.0.1' })
}
r = await call('Y', '/api/v1/auth/login', { method: 'POST', body: { email: 'admin@remit.su', password: 'AdminPass123' }, ip: '10.3.0.1' })
check('30 неудач с адреса — 429 для любой почты', r.status === 429, r.status)
// успешный вход сбрасывает счётчик почты
for (let i = 0; i < 4; i++) await call('Z', '/api/v1/auth/login', { method: 'POST', body: { email: 'admin@remit.su', password: 'bad' }, ip: '10.4.0.1' })
await call('Z', '/api/v1/auth/login', { method: 'POST', body: { email: 'admin@remit.su', password: 'AdminPass123' }, ip: '10.4.0.1' })
for (let i = 0; i < 4; i++) r = await call('Z', '/api/v1/auth/login', { method: 'POST', body: { email: 'admin@remit.su', password: 'bad' }, ip: '10.4.0.1' })
check('после успешного входа счётчик почты сброшен', r.status === 401, r.status)

// регистрации с одного адреса
let regStatus = 0
for (let i = 0; i < 11; i++) {
  r = await call('R', '/api/v1/auth/register', { method: 'POST', body: { email: `r${i}@example.com`, password: 'Password123' }, ip: '10.5.0.1' })
  regStatus = r.status
}
check('11-я регистрация с адреса — 429', regStatus === 429, regStatus)

// ---------- восстановление пароля по письму
const before = mails().length
r = await call('-', '/api/v1/auth/reset/request', { method: 'POST', body: { email: 'nobody@example.com' }, ip: '10.6.0.1' })
check('сброс: неизвестная почта — тот же ответ', r.status === 200 && r.data.ok === true, r.status)
r = await call('-', '/api/v1/auth/reset/request', { method: 'POST', body: { email: 'user@example.com' }, ip: '10.6.0.1' })
check('сброс: известная почта — тот же ответ', r.status === 200 && r.data.ok === true, r.status)
await sleep(1500)
const got = mails().slice(before)
check('письмо ушло только одно', got.length === 1, got.length)
const eml = got[0] ?? ''
check('письмо на нужный адрес и с темой', /To: user@example\.com/i.test(eml) && /Subject:/i.test(eml))
const link = linkFrom(eml)
check('в письме ссылка', Boolean(link), link)
const token = link?.split('/').pop()

r = await call('-', `/vosstanovlenie/${token}`, { raw: true })
check('страница нового пароля', r.status === 200 && r.text.includes('Новый пароль'))
check('страница: no-referrer', r.text.includes('name="referrer" content="no-referrer"'))
check('страница: счётчик не стартует', r.text.includes("indexOf('/vosstanovlenie/') !== 0") || r.text.includes('indexOf(\\u0027/vosstanovlenie/\\u0027)'))
r = await call('-', '/vosstanovlenie/abc', { raw: true })
check('битая ссылка — «не действует»', r.text.includes('Ссылка не действует'))

// старая сессия пользователя (вошёл при регистрации)
r = await call('U', '/api/v1/support/tickets')
check('до сброса старая сессия работает', r.status === 200, r.status)

r = await call('-', '/api/v1/auth/reset/confirm', { method: 'POST', body: { token, password: 'short' }, ip: '10.7.0.1' })
check('короткий пароль отклонён', r.status === 400, r.data.error)
r = await call('N', '/api/v1/auth/reset/confirm', { method: 'POST', body: { token, password: 'NewPassword2' }, ip: '10.7.0.1' })
check('пароль сменён', r.status === 200, JSON.stringify(r.data))
r = await call('N', '/api/v1/support/tickets')
check('после сброса — сразу вход', r.status === 200, r.status)
r = await call('U', '/api/v1/support/tickets')
check('старая сессия закрыта', r.status === 401, r.status)
r = await call('-', '/api/v1/auth/reset/confirm', { method: 'POST', body: { token, password: 'AnotherPass3' }, ip: '10.7.0.1' })
check('ссылка одноразовая', r.status === 400, r.data.error)
r = await call('-', '/api/v1/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'OldPassword1' }, ip: '10.8.0.1' })
check('старый пароль не подходит', r.status === 401, r.status)
r = await call('-', '/api/v1/auth/login', { method: 'POST', body: { email: 'user@example.com', password: 'NewPassword2' }, ip: '10.8.0.2' })
check('новый пароль подходит', r.status === 200, r.status)

// лимит писем на аккаунт: не больше 3 в час (одно уже было). Считаем только
// письма со ссылкой сброса: уведомление «пароль изменён» приходит асинхронно.
const resetMails = () => mails().filter((eml) => linkFrom(eml))
await sleep(1000)
const b2 = resetMails().length
for (let i = 0; i < 4; i++) {
  await call('-', '/api/v1/auth/reset/request', { method: 'POST', body: { email: 'user@example.com' }, ip: `10.9.0.${i}` })
}
await sleep(1500)
check('не больше 3 писем в час на аккаунт', resetMails().length - b2 === 2, resetMails().length - b2)

// ---------- ссылка из админки
r = await call('ADMIN', '/api/v1/auth/login', { method: 'POST', body: { email: 'admin@remit.su', password: 'AdminPass123' }, ip: '10.10.0.1' })
const users = await call('ADMIN', '/api/v1/admin/users?q=user@example.com', { ip: '10.10.0.1' })
const uid = users.data.users?.[0]?.id
r = await call('ADMIN', '/api/v1/admin/users', { method: 'POST', body: { userId: uid, action: 'reset-link' }, ip: '10.10.0.1' })
check('админ: ссылка создана', r.status === 200 && /\/vosstanovlenie\//.test(r.data.link ?? ''), r.data.link)
const adminToken = (r.data.link ?? '').split('/').pop()
r = await call('M', '/api/v1/auth/reset/confirm', { method: 'POST', body: { token: adminToken, password: 'ViaAdmin123' }, ip: '10.11.0.1' })
check('админ: ссылка работает', r.status === 200, r.status)
r = await call('U', '/api/v1/admin/users', { method: 'POST', body: { userId: uid, action: 'reset-link' }, ip: '10.12.0.1' })
check('не-админ ссылку не получит', r.status === 401 || r.status === 403, r.status)

console.log('OK:\n  ' + ok.join('\n  '))
if (fail.length) { console.log('\nПРОВАЛЫ:\n  ' + fail.join('\n  ')); process.exit(1) }
console.log(`\nВсе проверки прошли: ${ok.length}`)
