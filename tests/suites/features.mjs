// Блокировка и удаление, книги из админки, команды, тревоги, журналы, команды сервера,
// квота по токену, веб-клиент, VK ID.
import fs from 'node:fs'
import { readStore } from '../lib/store.mjs'
const B = process.env.BASE
const VK = process.env.VK_URL
const SERVICE = 'secret-tok'
const jar = new Map()
const ok = [], fail = []
const check = (label, cond, extra = '') => (cond ? ok : fail).push(`${label} ${typeof extra === 'object' ? JSON.stringify(extra).slice(0, 300) : extra}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function req(path, { method = 'POST', body, token, who, ip = '10.0.0.1', raw = false, headers = {}, redirect = 'manual' } = {}) {
  const res = await fetch(path.startsWith('http') ? path : B + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(who ? { cookie: jar.get(who) ?? '' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    redirect,
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (who && set.length) {
    const cookies = new Map((jar.get(who) ?? '').split('; ').filter(Boolean).map((c) => c.split('=')))
    for (const c of set) {
      const [pair] = c.split(';')
      const [k, ...v] = pair.split('=')
      if (v.join('=') === '') cookies.delete(k)
      else cookies.set(k, v.join('='))
    }
    jar.set(who, [...cookies].map(([k, v]) => `${k}=${v}`).join('; '))
  }
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data, text, location: res.headers.get('location') }
}
const register = (who, email, password, name, ip) => req('/api/v1/auth/register', { who, body: { email, password, name }, ip })
const siteLogin = (who, email, password, ip = '10.3.3.3') => req('/api/v1/auth/login', { who, body: { email, password }, ip })
const clientLogin = (username, password, id = '', extra = {}) =>
  req('/api/login', {
    ip: extra.ip ?? '10.0.0.1',
    headers: extra.headers ?? {},
    body: { username, password, id, uuid: 'u-' + id, autoLogin: true, type: 'account', deviceInfo: { name: extra.name ?? 'PC', os: 'Windows 10', type: extra.type ?? 'client' } },
  })
const admin = (path, body) => req(path, { who: 'ADM', body })

// ---------- аккаунты
for (const [who, email, password, name, ip] of [
  ['ADM', 'admin@remit.su', 'AdminPass123', 'Админ', '10.1.0.1'],
  ['A', 'anna@example.com', 'AnnaPass123', 'Анна', '10.1.0.2'],
  ['B', 'bob@example.com', 'BobPass1234', 'Боб', '10.1.0.3'],
  ['C', 'carl@example.com', 'CarlPass123', 'Карл', '10.1.0.4'],
]) check(`регистрация ${email}`, (await register(who, email, password, name, ip)).status === 200)
let s = (await readStore())
const id = async (email) => (await readStore()).users.find((u) => u.email === email)?.id
const anna = await id('anna@example.com'), bob = await id('bob@example.com'), carl = await id('carl@example.com'), adm = await id('admin@remit.su')

let r = await clientLogin('anna@example.com', 'AnnaPass123', '700000010', { name: 'ANNA-PC' })
const annaToken = r.data.access_token
r = await clientLogin('bob@example.com', 'BobPass1234', '700000020', { name: 'BOB-PC' })
let bobToken = r.data.access_token
r = await clientLogin('carl@example.com', 'CarlPass123', '700000030', { name: 'CARL-PC' })
const carlToken = r.data.access_token

// ---------- 1. Блокировка и удаление
r = await admin('/api/v1/admin/users', { action: 'block', userId: adm })
check('себя не заблокировать', r.status === 400, r)
r = await admin('/api/v1/admin/users', { action: 'block', userId: carl })
check('блокировка', r.status === 200, r)
check('блок: вход в клиенте закрыт', (await req('/api/currentUser', { token: carlToken })).status === 401)
r = await siteLogin('C2', 'carl@example.com', 'CarlPass123')
check('блок: вход на сайте — 403 с объяснением', r.status === 403 && /заблокирован/.test(r.data.error), r)
r = await siteLogin('C3', 'carl@example.com', 'wrong-pass')
check('блок: неверный пароль — обычная ошибка', r.status === 401 && !/заблокирован/.test(r.data.error), r)
r = await clientLogin('carl@example.com', 'CarlPass123', '700000030')
check('блок: клиент показывает причину', r.status === 400 && /заблокирован/.test(r.data.error), r)
r = await req('/kabinet', { method: 'GET', who: 'C' })
check('блок: старая сессия сайта не действует', r.status === 307 || r.status === 302 || /vhod/.test(r.location ?? ''), r.status)
r = await admin('/api/v1/admin/users', { action: 'unblock', userId: carl })
r = await siteLogin('C', 'carl@example.com', 'CarlPass123')
check('разблокировка', r.status === 200, r)

// удаление: подготовим данные карла
await req('/api/v1/address-books', { who: 'C', body: { action: 'create', name: 'Карл' } })
r = await admin('/api/v1/admin/users', { action: 'delete', userId: carl })
check('удаление', r.status === 200, r)
s = (await readStore())
const carlRow = s.users.find((u) => u.id === carl)
check('удаление: данные стёрты', carlRow.status === 'deleted' && carlRow.email.startsWith('deleted-') && carlRow.passwordHash === '' && carlRow.name === '', carlRow)
check('удаление: книги и устройства', !s.addressBooks.some((b) => b.ownerId === carl) && !s.devices.some((d) => d.userId === carl))
r = await register('C4', 'carl@example.com', 'NewCarl12345', 'Карл', '10.1.0.9')
check('после удаления почту можно занять снова', r.status === 200, r)
r = await req('/admin/polzovateli', { method: 'GET', who: 'ADM' })
check('админка: пометки статуса', r.text.includes('удалён'), r.status)

// ---------- 2. Книги из админки
r = await admin('/api/v1/admin/address-books', { action: 'create', userId: anna, name: 'Клиенты Анны' })
const annaShared = r.data?.guid
check('админ: книга для пользователя', r.status === 200 && annaShared, r)
r = await admin('/api/v1/admin/address-books', { action: 'peer-add', guid: annaShared, id: '900000001', alias: 'Клиент', tags: 'vip' })
check('админ: запись в чужую книгу', r.status === 200, r)
r = await admin('/api/v1/admin/address-books', { action: 'share', guid: annaShared, email: 'bob@example.com', rule: 2 })
check('админ: доступ', r.status === 200, r)
r = await admin('/api/v1/admin/address-books', { action: 'peers-from-devices', guid: annaShared })
check('админ: устройства владельца в книгу', r.status === 200 && r.data.added === 1, r)
r = await req(`/api/ab/peers?ab=${annaShared}`, { token: annaToken })
check('клиент видит правки админа', r.data.total === 2 && r.data.data.some((p) => p.id === '700000010' && p.hostname === 'ANNA-PC'), r.data)
r = await req('/api/v1/admin/address-books', { who: 'A', body: { action: 'delete', guid: annaShared } })
check('не-админ не может', r.status !== 200, r.status)
r = await req(`/admin/adresnye-knigi?ab=${annaShared}`, { method: 'GET', who: 'ADM' })
check('админ: редактор книги', r.text.includes('Добавить все устройства владельца') && r.text.includes('Доступ к книге'), r.status)
r = await req('/api/v1/address-books', { who: 'B', body: { action: 'peers-from-devices', guid: annaShared } })
check('кабинет: свои устройства в общую книгу (запись)', r.status === 200 && r.data.added === 1, r)

// ---------- 3. Команды и группы устройств
r = await req('/api/users', { method: 'GET', token: annaToken })
check('без команды — только я', r.data.total === 1)
r = await req('/api/v1/team', { who: 'A', body: { action: 'create', name: 'Отдел ИТ' } })
check('команда создана', r.status === 200, r)
r = await req('/api/v1/team', { who: 'A', body: { action: 'invite', email: 'bob@example.com' } })
check('приглашение', r.status === 200, r)
r = await req('/api/peers', { method: 'GET', token: annaToken })
check('приглашённый ещё не виден', r.data.total === 1, r.data)
r = await req('/kabinet/komanda', { method: 'GET', who: 'B' })
check('Боб видит приглашение', r.text.includes('Приглашение в команду') && r.text.includes('Отдел ИТ'))
r = await req('/api/v1/team', { who: 'B', body: { action: 'accept' } })
check('приглашение принято', r.status === 200, r)
r = await req('/api/users', { method: 'GET', token: annaToken })
check('users: оба участника', r.data.total === 2, r.data)
r = await req('/api/peers', { method: 'GET', token: bobToken })
check('peers: устройства команды', r.data.total === 2 && r.data.data.some((p) => p.id === '700000010' && p.user_name === 'anna@example.com'), r.data)
r = await req('/api/v1/team', { who: 'A', body: { action: 'group-create', name: 'Бухгалтерия' } })
const groupId = (await readStore()).deviceGroups[0]?.id
check('группа создана', r.status === 200 && groupId, r)
r = await req('/api/v1/team', { who: 'A', body: { action: 'assign', rustdeskId: '700000020', groupId } })
check('устройство Боба в группе', r.status === 200, r)
r = await req('/api/v1/team', { who: 'B', body: { action: 'assign', rustdeskId: '700000010', groupId } })
check('участник группы не раздаёт', r.status === 403, r)
r = await req('/api/v1/team', { who: 'A', body: { action: 'assign', rustdeskId: '999999999', groupId } })
check('чужое устройство не в группу', r.status === 404, r)
r = await req('/api/device-group/accessible', { method: 'GET', token: bobToken })
check('device-group: группы команды', r.data.total === 1 && r.data.data[0].name === 'Бухгалтерия', r.data)
r = await req('/api/peers', { method: 'GET', token: annaToken })
check('peers: имя группы', r.data.data.find((p) => p.id === '700000020')?.device_group_name === 'Бухгалтерия', r.data)
r = await req('/kabinet/komanda', { method: 'GET', who: 'A' })
check('кабинет: страница команды', r.text.includes('Отдел ИТ') && r.text.includes('Бухгалтерия') && r.text.includes('bob@example.com'))
r = await req('/api/v1/team', { who: 'B', body: { action: 'create', name: 'Вторая' } })
check('одна команда на аккаунт', r.status === 400, r)
r = await req('/api/v1/team', { who: 'B', body: { action: 'leave' } })
check('Боб вышел', r.status === 200)
check('группа снята с устройства ушедшего', (await readStore()).devices.find((d) => d.rustdeskId === '700000020').groupId === null)
check('после выхода не видно', (await req('/api/peers', { method: 'GET', token: annaToken })).data.total === 1)
await req('/api/v1/team', { who: 'A', body: { action: 'invite', email: 'bob@example.com' } })
await req('/api/v1/team', { who: 'B', body: { action: 'accept' } })
r = await req('/admin/komandy', { method: 'GET', who: 'ADM' })
check('админ: команды', r.text.includes('Отдел ИТ') && r.text.includes('bob@example.com'))
const teamId = (await readStore()).teams[0].id
r = await admin('/api/v1/admin/teams', { action: 'remove', teamId, userId: bob })
check('админ: исключить', r.status === 200)
r = await admin('/api/v1/admin/teams', { action: 'disband', teamId })
check('админ: распустить', r.status === 200 && (await readStore()).teams.length === 0 && (await readStore()).deviceGroups.length === 0)

// ---------- 4. Тревоги и журналы
r = await req('/api/audit/alarm', { body: { id: '700000010', uuid: 'x', typ: 2, info: JSON.stringify({ ip: '6.6.6.6', id: '123', name: 'EVIL' }), conn_id: 1 } })
check('тревога принята', r.status === 200 && (await readStore()).alarms.length === 1, r)
r = await req('/kabinet/istoriya', { method: 'GET', who: 'A' })
check('кабинет: тревоги в истории', r.text.includes('6 неверных паролей за минуту') && r.text.includes('6.6.6.6'))
r = await req('/admin/trevogi', { method: 'GET', who: 'ADM' })
check('админ: тревоги', r.text.includes('6 неверных паролей за минуту') && r.text.includes('anna@example.com'))
await req('/api/audit/file', { body: { id: '700000010', peer_id: '700000020', type: 0, path: 'C:\\data', is_file: true, info: JSON.stringify({ ip: '1.1.1.1', name: 'BOB', num: 1, files: [['a', 1]] }) } })
const alarmId = (await readStore()).alarms[0].id, fileId = (await readStore()).fileAudits[0].id
r = await admin('/api/v1/admin/logs', { action: 'delete', kind: 'alarm', id: alarmId })
check('удаление тревоги', r.status === 200 && (await readStore()).alarms.length === 0)
r = await admin('/api/v1/admin/logs', { action: 'delete', kind: 'file', id: fileId })
check('удаление записи о файлах', r.status === 200 && (await readStore()).fileAudits.length === 0)
const activeHash = (await readStore()).clientTokens.find((t) => !t.revokedAt).tokenHash
r = await admin('/api/v1/admin/logs', { action: 'delete', kind: 'login', id: activeHash })
check('действующий вход не удалить', r.status === 400, r)
await req('/api/logout', { token: annaToken })
const revokedHash = (await readStore()).clientTokens.find((t) => t.revokedAt).tokenHash
r = await admin('/api/v1/admin/logs', { action: 'delete', kind: 'login', id: revokedHash })
check('завершённый вход удалён', r.status === 200 && !(await readStore()).clientTokens.some((t) => t.tokenHash === revokedHash))
r = await admin('/api/v1/admin/logs', { action: 'purge', kind: 'login', days: 0 })
check('очистка журнала входов', r.status === 200 && (await readStore()).clientTokens.every((t) => !t.revokedAt), r)
r = await req('/api/v1/admin/logs', { who: 'A', body: { action: 'purge', kind: 'alarm', days: 0 } })
check('чистка журналов — только админ', r.status !== 200)

// ---------- 5. Команды серверу
r = await admin('/api/v1/admin/server-cmd', { target: 'hbbs', command: 'rs' })
check('hbbs: команда', r.status === 200 && /127\.0\.0\.1:21117/.test(r.data.output), r)
r = await admin('/api/v1/admin/server-cmd', { target: 'hbbs', command: 'h' })
check('hbbs: справка', r.status === 200 && /relay-servers/.test(r.data.output), r)
r = await admin('/api/v1/admin/server-cmd', { target: 'hbbr', command: 'ba 5.5.5.5' })
r = await admin('/api/v1/admin/server-cmd', { target: 'hbbr', command: 'b' })
check('hbbr: чёрный список', r.status === 200 && /5\.5\.5\.5/.test(r.data.output), r)
r = await admin('/api/v1/admin/server-cmd', { target: 'hbbs', command: 'rm -rf /' })
check('неизвестная команда отклонена', r.status === 400, r)
r = await req('/admin/server', { method: 'GET', who: 'ADM' })
check('админ: страница сервера', r.status === 200 && r.text.includes('always-use-relay'))

// ---------- 6. Квота по токену входа (как спросит hbbs)
r = await clientLogin('anna@example.com', 'AnnaPass123', '700000010', { name: 'ANNA-PC' })
const annaToken2 = r.data.access_token
await admin('/api/v1/admin/subscriptions', { action: 'grant', userId: anna, plan: 'pro', months: 1 })
const qc = (body) => req('/api/v1/quota/check', { body, headers: { authorization: `Bearer ${SERVICE}` } })
r = await qc({ id: '555555555', token: annaToken2 })
check('квота: по токену — тариф аккаунта', r.status === 200 && r.data.plan === 'pro', r)
r = await qc({ id: '555555555', token: 'garbage' })
check('квота: кривой токен — по устройству', r.status === 200 && r.data.plan === 'free', r)

// ---------- 7. Веб-клиент: только платные тарифы (у Анны «Профи», Боб — бесплатный)
r = await req('/webclient', { method: 'GET' })
check('веб-клиент: без входа — на вход', r.status === 303 && r.location?.endsWith('/vhod'), r.status)
r = await req('/webclient', { method: 'GET', who: 'B' })
check('веб-клиент: бесплатный тариф — к тарифам', r.status === 303 && r.location?.endsWith('/kabinet/veb-klient'), r)
r = await req('/kabinet/veb-klient', { method: 'GET', who: 'B' })
check('кабинет: предложение тарифа', r.text.includes('Входит в любой платный тариф') && !r.text.includes('Ссылка для гостя'))
r = await req('/webclient', { method: 'GET', who: 'A' })
check('веб-клиент: подписчику открыт', r.status === 200 && r.text.includes('бета') && r.text.includes('main.dart.js'), r.status)
check('веб-клиент без Firebase', !r.text.includes('firebase-analytics') && !r.text.includes('libs/firebase'))
r = await req('/webclient/', { method: 'GET', who: 'A', redirect: 'follow' })
check('веб-клиент: адрес со слешем', r.status === 200 && r.text.includes('main.dart.js'), r.status)
r = await req('/webclient/index.html', { method: 'GET' })
check('старый index.html не отдаётся в обход проверки', r.status === 404, r.status)
r = await req('/webclient/main.dart.js', { method: 'GET' })
check('шрифты не из Google напрямую', r.status === 200 && !r.text.includes('https://fonts.gstatic.com/s/'))
r = await req('/webclient-config/index.js', { method: 'GET', who: 'A' })
const wcToken = r.text.match(/"access_token", "([^"]+)"/)?.[1]
check('конфиг: сервер и автоматический вход подписчика', r.text.includes('"custom-rendezvous-server", "remit.su:21116"') && wcToken && r.text.includes('user_info'), r.text)
r = await req('/webclient-config/index.js', { method: 'GET', who: 'A' })
check('конфиг: токен не плодится', r.text.includes(wcToken) && (await readStore()).clientTokens.filter((t) => t.deviceId === 'web').length === 1)
r = await req('/webclient-config/index.js', { method: 'GET', who: 'B' })
check('конфиг: бесплатному без входа', !r.text.includes('access_token'))
const annaPersonal = (await req('/api/ab/personal', { token: annaToken2 })).data.guid
await req(`/api/ab/peer/add/${annaPersonal}`, { token: annaToken2, body: { id: '123123123', alias: 'Дом', hash: 'aGFzaA==' } })
r = await req('/api/server-config', { token: wcToken })
check('server-config: сервер и книга', r.data?.code === 0 && r.data.data.id_server === 'remit.su:21116' && r.data.data.peers['123123123']?.info.hash === 'aGFzaA==', r.data)
r = await clientLogin('bob@example.com', 'BobPass1234', 'web', { headers: { referer: 'https://remit.su/webclient' }, type: 'browser' })
check('веб-клиент: вход бесплатного — отказ', r.status === 403 && /платном тарифе/.test(r.data.error), r)
r = await clientLogin('bob@example.com', 'BobPass1234', '700000020', { name: 'BOB-PC' })
bobToken = r.data.access_token
r = await req('/api/server-config', { token: bobToken })
check('server-config: бесплатному — отказ', r.data?.code === 101, r.data)
r = await clientLogin('anna@example.com', 'AnnaPass123', 'web', { headers: { referer: 'https://remit.su/webclient' }, type: 'browser' })
check('веб-клиент: вход подписчика', r.status === 200)
check('веб-клиент не стал устройством', !(await readStore()).devices.some((d) => d.rustdeskId === 'web'))
r = await req('/api/server-config')
check('server-config без входа — 401', r.status === 401)
// гостевые ссылки
r = await req('/api/v1/webclient', { who: 'B', body: { action: 'share', peerId: '700000020', password: 'x', passwordType: 'once', ttl: '1d' } })
check('ссылку создаёт только платный', r.status === 403, r)
r = await req('/api/v1/webclient', { who: 'A', body: { action: 'share', peerId: '700000010', password: 'devPass!1', passwordType: 'once', ttl: '1d' } })
check('гостевая ссылка', r.status === 200 && /\/webclient\?share=/.test(r.data.url), r)
const onceToken = decodeURIComponent(r.data.url.split('share=')[1])
check('пароль в базе зашифрован', !JSON.stringify((await readStore()).webShares).includes('devPass!1'))
r = await req(`/webclient?share=${encodeURIComponent(onceToken)}`, { method: 'GET' })
check('гость открывает страницу без аккаунта', r.status === 200 && r.text.includes('share_token'), r.status)
const guestToken = r.text.match(/setItem\('access_token', "([^"]+)"\)/)?.[1]
check('гостю выдан токен', Boolean(guestToken))
check('гостевой токен не открывает API', (await req('/api/ab/personal', { token: guestToken })).status === 401 && (await req('/api/server-config', { token: guestToken })).status === 401)
r = await req('/api/currentUser', { token: guestToken })
check('гость в веб-клиенте — «Гость», не владелец', r.status === 200 && r.data.name === 'Гость', r.data)
r = await qc({ id: '700000010', token: guestToken, ws: true })
check('hbbs: гость к своему устройству — пропуск', r.data.allowed === true, r.data)
r = await qc({ id: '700000099', token: guestToken, ws: true })
check('hbbs: гость к чужому устройству — отказ', r.data.allowed === false && r.data.reason === 'webclient_paid_only', r.data)
r = await qc({ id: '700000010', ws: true })
check('hbbs: браузер без токена — отказ', r.data.allowed === false && /платном тарифе/.test(r.data.message), r.data)
r = await qc({ id: '700000010', token: bobToken, ws: true })
check('hbbs: браузер с токеном бесплатного — отказ', r.data.allowed === false, r.data)
r = await qc({ id: '700000010', token: wcToken, ws: true })
check('hbbs: браузер подписчика — пропуск', r.data.allowed === true, r.data)
r = await qc({ id: '700000010', token: bobToken })
check('hbbs: приложение бесплатного — как раньше', r.data.allowed === true && r.data.plan === 'free', r.data)
r = await req('/api/shared-peer', { body: { share_token: onceToken } })
check('гость получил устройство', r.data.code === 0 && r.data.data.peer.info.id === '700000010' && Buffer.from(r.data.data.peer.tmppwd, 'base64').toString() === 'devPass!1', r.data)
r = await req('/api/shared-peer', { body: { share_token: onceToken } })
check('одноразовая ссылка сгорела', r.data.code === 101, r.data)
r = await req(`/webclient?share=${encodeURIComponent(onceToken)}`, { method: 'GET' })
check('сгоревшая ссылка — страница «не действует»', r.status === 303 && r.location?.includes('ssylka-ne-deystvuet'), r)
r = await req('/api/v1/webclient', { who: 'A', body: { action: 'share', peerId: '700000010', password: 'p', passwordType: 'fixed', ttl: 'never' } })
const fixedToken = decodeURIComponent(r.data.url.split('share=')[1])
r = await req(`/webclient?share=${encodeURIComponent(fixedToken)}`, { method: 'GET' })
const guestToken2 = r.text.match(/setItem\('access_token', "([^"]+)"\)/)?.[1]
check('многоразовая: гостевой токен', Boolean(guestToken2))
check('многоразовая работает дважды', (await req('/api/shared-peer', { body: { share_token: fixedToken } })).data.code === 0 && (await req('/api/shared-peer', { body: { share_token: fixedToken } })).data.code === 0)
r = await req('/api/v1/webclient', { who: 'B', body: { action: 'revoke', token: fixedToken } })
check('чужую ссылку не отозвать', r.status === 404)
r = await req('/kabinet/veb-klient', { method: 'GET', who: 'A' })
check('кабинет: веб-клиент подписчика', r.status === 200 && r.text.includes('бета') && r.text.includes('Ссылка для гостя'))
r = await req('/skachat', { method: 'GET' })
check('страница загрузки: веб-клиент на платных', r.text.includes('Открыть веб-клиент') && r.text.includes('платном тарифе'))
r = await req('/tarify', { method: 'GET' })
check('тарифы: веб-клиент в платных', (r.text.match(/Веб-клиент в браузере \(бета\)/g) ?? []).length >= 3)
// учёт времени: веб-клиент подключается под ID «web»
await qc({ id: '700000020', token: wcToken })
await req('/api/audit/conn', { body: { action: 'new', id: '700000020', conn_id: 50, ip: '1.2.3.4' } })
await req('/api/audit/conn', { body: { id: '700000020', conn_id: 50, peer: ['web', 'Browser'], type: 0 } })
check('сессия веб-клиента — на подписчика (по токену из hbbs)', (await readStore()).connSessions.find((x) => x.key === '700000020:50')?.subjectKey === `user:${anna}`)
await req('/api/audit/conn', { body: { action: 'new', id: '700000020', conn_id: 51, ip: '1.2.3.4' } })
await req('/api/audit/conn', { body: { id: '700000020', conn_id: 51, peer: ['web', 'Guest'], type: 0 } })
check('без проверки hbbs — владельцу устройства, не общему «web»', (await readStore()).connSessions.find((x) => x.key === '700000020:51')?.subjectKey === `user:${bob}`)
// подписка закончилась — ссылки и страница закрываются
await admin('/api/v1/admin/subscriptions', { action: 'cancel', userId: anna })
r = await req('/api/shared-peer', { body: { share_token: fixedToken } })
check('без подписки ссылка не работает', r.data.code === 101, r.data)
r = await req('/webclient', { method: 'GET', who: 'A' })
check('без подписки страница закрыта', r.status === 303 && r.location?.endsWith('/kabinet/veb-klient'), r.status)
r = await req(`/webclient?share=${encodeURIComponent(fixedToken)}`, { method: 'GET' })
check('без подписки гостевая страница закрыта', r.status === 303, r.status)
r = await req('/api/v1/webclient', { who: 'A', body: { action: 'revoke', token: fixedToken } })
check('отзыв ссылки', r.status === 200)
check('после отзыва гостевой токен не действует', (await req('/api/currentUser', { token: guestToken2 })).status === 401)

// ---------- 8. VK ID
r = await req('/api/login-options', { method: 'GET' })
check('login-options: VK ID', Array.isArray(r.data) && r.data.includes('oidc/VK ID') && r.data[0].startsWith('common-oidc/'), r.data)
r = await req('/vhod', { method: 'GET' })
check('кнопка VK на входе', r.text.includes('Войти через VK ID'))

async function vkFlow(startPath, who) {
  let res = await req(startPath, { method: 'GET', who })
  if (!res.location) return { error: 'no redirect', res }
  const authorize = await fetch(res.location, { redirect: 'manual' })
  const back = authorize.headers.get('location')
  if (!back) return { error: 'vk refused', status: authorize.status, body: await authorize.text() }
  return req(back, { method: 'GET', who })
}
await fetch(VK + '/__set', { method: 'POST', body: JSON.stringify({ user_id: 1001, first_name: 'Иван', last_name: 'ВК', email: 'vk1@example.com' }) })
r = await vkFlow('/api/v1/auth/vk/start?action=login', 'V')
check('VK: новый аккаунт и вход', r.status === 303 && r.location?.endsWith('/kabinet'), r)
r = await req('/kabinet', { method: 'GET', who: 'V' })
check('VK: кабинет открыт', r.status === 200 && r.text.includes('Иван ВК'), r.status)
const vkUser = (await readStore()).users.find((u) => u.email === 'vk1@example.com')
check('VK: аккаунт без пароля и привязка', vkUser && vkUser.passwordHash === '' && (await readStore()).oauthIdentities.some((i) => i.subject === '1001' && i.userId === vkUser.id))
const tokenLog = (await (await fetch(VK + '/__log')).json()).filter((e) => e.token).at(-1).token
check('VK: PKCE и параметры обмена', tokenLog.grant_type === 'authorization_code' && tokenLog.code_verifier.length >= 43 && tokenLog.device_id && tokenLog.client_id === 'vk-app-1', tokenLog)
r = await vkFlow('/api/v1/auth/vk/start?action=login', 'V2')
check('VK: повторный вход — тот же аккаунт', r.location?.endsWith('/kabinet') && (await readStore()).users.filter((u) => u.email === 'vk1@example.com').length === 1)
await fetch(VK + '/__set', { method: 'POST', body: JSON.stringify({ user_id: 2002, first_name: 'Чужой', last_name: '', email: 'anna@example.com' }) })
r = await vkFlow('/api/v1/auth/vk/start?action=login', 'V3')
check('VK: чужую почту не забираем', /vhod\?vk_error=/.test(r.location ?? '') && decodeURIComponent(r.location).includes('уже есть'), r.location)
await fetch(VK + '/__set', { method: 'POST', body: JSON.stringify({ user_id: 3003, first_name: 'Без', last_name: 'Почты' }) })
r = await vkFlow('/api/v1/auth/vk/start?action=login', 'V4')
check('VK: без почты — объяснение', decodeURIComponent(r.location ?? '').includes('нет почты'), r.location)
// привязка к существующему аккаунту
await fetch(VK + '/__set', { method: 'POST', body: JSON.stringify({ user_id: 4004, first_name: 'Анна', last_name: 'VK', email: 'anna-vk@example.com' }) })
r = await vkFlow('/api/v1/auth/vk/start?action=link', 'A')
check('VK: привязка из профиля', r.location?.includes('/kabinet/profil?vk=linked') && (await readStore()).oauthIdentities.some((i) => i.subject === '4004' && i.userId === anna), r)
r = await req('/kabinet/profil', { method: 'GET', who: 'A' })
check('профиль: VK привязан', r.text.includes('Привязан профиль') && r.text.includes('Анна VK'))
r = await vkFlow('/api/v1/auth/vk/start?action=login', 'A2')
check('VK: вход в привязанный аккаунт', r.location?.endsWith('/kabinet') && (await req('/kabinet', { method: 'GET', who: 'A2' })).text.includes('Анна'))
r = await vkFlow('/api/v1/auth/vk/start?action=link', 'B')
check('VK: один профиль — один аккаунт', decodeURIComponent(r.location ?? '').includes('уже привязан'), r.location)
r = await req('/api/v1/auth/vk/unlink', { who: 'V' })
check('VK: без пароля не отвязать', r.status === 400, r)
r = await req('/api/v1/auth/vk/unlink', { who: 'A' })
check('VK: отвязка', r.status === 200 && !(await readStore()).oauthIdentities.some((i) => i.userId === anna))
// вход в клиенте через VK ID
await fetch(VK + '/__set', { method: 'POST', body: JSON.stringify({ user_id: 1001, first_name: 'Иван', last_name: 'ВК', email: 'vk1@example.com' }) })
r = await req('/api/oidc/auth', { body: { op: 'VK ID', id: '700000099', uuid: 'u99', deviceInfo: { name: 'VK-PC', os: 'Windows', type: 'client' } } })
check('клиент: начало входа VK', r.status === 200 && r.data.code && r.data.url.startsWith(VK + '/authorize'), r)
const oidc = r.data
r = await req(`/api/oidc/auth-query?code=${oidc.code}&id=700000099&uuid=u99`, { method: 'GET' })
check('клиент: пока ждём', r.data.error === 'No authed oidc is found', r.data)
const vkBack = (await fetch(oidc.url, { redirect: 'manual' })).headers.get('location')
r = await req(vkBack, { method: 'GET' })
check('клиент: страница «вход выполнен»', r.status === 200 && r.text.includes('Вход выполнен') && r.text.includes('vk1@example.com'), r.status)
r = await req(`/api/oidc/auth-query?code=${oidc.code}&id=OTHER&uuid=u99`, { method: 'GET' })
check('клиент: чужое устройство не заберёт вход', /другом устройстве/.test(r.data.error), r.data)
r = await req(`/api/oidc/auth-query?code=${oidc.code}&id=700000099&uuid=u99`, { method: 'GET' })
check('клиент: токен после VK', r.data.type === 'access_token' && r.data.user.name === 'vk1@example.com', r.data)
check('клиент: токен работает', (await req('/api/currentUser', { token: r.data.access_token })).status === 200)
check('клиент: устройство привязано', (await readStore()).devices.find((d) => d.rustdeskId === '700000099')?.userId === vkUser.id)
r = await req(`/api/oidc/auth-query?code=${oidc.code}&id=700000099&uuid=u99`, { method: 'GET' })
check('клиент: код одноразовый', /истекло/.test(r.data.error), r.data)
r = await req('/api/oidc/auth', { body: { op: 'google', id: '1' } })
check('клиент: чужой провайдер', r.status === 400)
await admin('/api/v1/admin/users', { action: 'block', userId: vkUser.id })
r = await vkFlow('/api/v1/auth/vk/start?action=login', 'V5')
check('VK: заблокированный не войдёт', decodeURIComponent(r.location ?? '').includes('заблокирован'), r.location)

// ---------- 9. Самоудаление
r = await req('/api/v1/account/delete', { who: 'B', body: { password: 'wrong' } })
check('самоудаление: неверный пароль', r.status === 400)
r = await req('/api/v1/account/delete', { who: 'B', body: { password: 'BobPass1234' } })
check('самоудаление', r.status === 200 && (await readStore()).users.find((u) => u.id === bob).status === 'deleted')
check('после самоудаления вход закрыт', (await siteLogin('B9', 'bob@example.com', 'BobPass1234')).status === 401)

console.log('OK:\n  ' + ok.join('\n  '))
if (fail.length) {
  console.log('\nFAIL:\n  ' + fail.join('\n  '))
  process.exit(1)
}
console.log(`\nВсе проверки прошли: ${ok.length}`)
