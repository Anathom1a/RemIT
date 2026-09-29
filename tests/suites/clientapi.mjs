// Сквозная проверка API клиента RustDesk, которое теперь обслуживает сайт.
import fs from 'node:fs'
import { createHmac } from 'node:crypto'
import { readStore } from '../lib/store.mjs'
const B = process.env.BASE
const JWT_KEY = 'test-jwt-key'
const jar = new Map()
const ok = [], fail = []
const check = (label, cond, extra = '') => (cond ? ok : fail).push(`${label} ${typeof extra === 'object' ? JSON.stringify(extra).slice(0, 400) : extra}`)

async function req(path, { method = 'POST', body, token, who, ip = '10.0.0.1', raw = false, headers = {} } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(who ? { cookie: jar.get(who) ?? '' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    redirect: 'manual',
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (who && set.length) jar.set(who, set.map((c) => c.split(';')[0]).join('; '))
  const text = await res.text()
  if (raw) return { status: res.status, text }
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data, text }
}
const clientLogin = (username, password, id = '', name = 'PC', ip = '10.0.0.1') =>
  req('/api/login', {
    ip,
    body: { username, password, id, uuid: 'dXVpZC0' + id, autoLogin: true, type: 'account', deviceInfo: { name, os: 'Windows 10', type: 'client' } },
  })

// ---------- аккаунты
for (const [who, email, password, name] of [
  ['A', 'anna@example.com', 'AnnaPass123', 'Анна'],
  ['B', 'bob@example.com', 'BobPass1234', 'Боб'],
  ['ADM', 'admin@remit.su', 'AdminPass123', 'Админ'],
]) {
  const r = await req('/api/v1/auth/register', { who, body: { email, password, name }, ip: `10.1.0.${who.length}` })
  check(`регистрация ${email}`, r.status === 200, r.status)
}

// ---------- вход в клиенте
let r = await clientLogin('anna@example.com', 'wrong-pass')
check('вход: неверный пароль', r.status === 400 && r.data.error === 'Неверная почта или пароль', r)
r = await req('/api/login', { body: {} })
check('вход: пустой', r.status === 400 && r.data.error, r)
r = await clientLogin('Anna@Example.com', 'AnnaPass123', '700000010', 'PC-ANNA')
check('вход: успех', r.status === 200 && r.data.type === 'access_token' && r.data.access_token, r)
check('вход: пользователь', r.data.user?.name === 'anna@example.com' && r.data.user?.display_name === 'Анна' && r.data.user?.status === 1, r.data.user)
const annaToken = r.data.access_token

// JWT как у hbbs (jsonwebtoken, HS256): подпись, exp, user_id — число
const [h, p, sig] = annaToken.split('.')
const expected = createHmac('sha256', JWT_KEY).update(`${h}.${p}`).digest('base64url')
const header = JSON.parse(Buffer.from(h, 'base64url'))
const claims = JSON.parse(Buffer.from(p, 'base64url'))
check('JWT: HS256 и подпись JWT_KEY', header.alg === 'HS256' && sig === expected, header)
check('JWT: user_id — u32, exp ≈ 30 дней', Number.isInteger(claims.user_id) && claims.user_id >= 0 && claims.user_id < 2 ** 32 && Math.abs(claims.exp - Date.now() / 1000 - 30 * 86400) < 120, claims)

let s = (await readStore())
const anna = s.users.find((u) => u.email === 'anna@example.com')
const bobUser = s.users.find((u) => u.email === 'bob@example.com')
check('вход: устройство привязано', s.devices.find((d) => d.rustdeskId === '700000010')?.userId === anna.id)
check('вход: журнал входа', s.clientTokens.some((t) => t.userId === anna.id && t.deviceId === '700000010' && t.deviceName === 'PC-ANNA' && t.ip === '10.0.0.1' && !t.tokenHash.includes(annaToken)))

// ---------- проверка токена
r = await req('/api/currentUser', { token: annaToken })
check('currentUser', r.status === 200 && r.data.name === 'anna@example.com', r)
r = await req('/api/user/info', { method: 'GET', token: annaToken })
check('user/info', r.status === 200 && r.data.email === 'anna@example.com', r)
r = await req('/api/currentUser')
check('currentUser без токена — 401', r.status === 401 && r.data.error === 'Unauthorized', r)
const forged = `${h}.${p}.${createHmac('sha256', 'other').update(`${h}.${p}`).digest('base64url')}`
r = await req('/api/currentUser', { token: forged })
check('поддельная подпись — 401', r.status === 401)
r = await req('/api/login-options', { method: 'GET' })
check('login-options', r.status === 200 && Array.isArray(r.data) && r.data.length === 0, r)

// ---------- heartbeat и сведения о системе
r = await req('/api/heartbeat', { body: { id: '700000010', uuid: 'dXVpZA==', ver: 1004009 }, ip: '5.6.7.8' })
check('heartbeat просит sysinfo', r.status === 200 && r.data.sysinfo === true, r)
r = await req('/api/sysinfo_ver', {})
check('sysinfo_ver', r.status === 200 && r.text === 'remit-1', r.text)
r = await req('/api/sysinfo', {
  body: { id: '700000010', uuid: 'dXVpZA==', hostname: 'ANNA-HOME', username: 'anna', os: 'Windows 10 Pro', cpu: 'Intel i5', memory: '16GB', version: '1.4.9' },
})
check('sysinfo', r.status === 200 && r.text === 'SYSINFO_UPDATED', r.text)
r = await req('/api/sysinfo', { body: {} })
check('sysinfo без id', r.text === 'ID_NOT_FOUND', r.text)
r = await req('/api/heartbeat', { body: { id: '700000010', uuid: 'dXVpZA==', ver: 1004009 }, ip: '5.6.7.8' })
check('heartbeat больше не просит sysinfo', r.status === 200 && !('sysinfo' in (r.data ?? {})), r)
const dev = (await readStore()).devices.find((d) => d.rustdeskId === '700000010')
check('устройство: сведения о системе', dev.name === 'ANNA-HOME' && dev.osUsername === 'anna' && dev.cpu === 'Intel i5' && dev.memory === '16GB' && dev.lastIp === '5.6.7.8' && dev.sysinfoAt, dev)

// ---------- адресная книга (новый API)
r = await req('/api/ab/settings', { token: annaToken })
check('ab/settings', r.status === 200 && r.data.max_peer_one_ab === 0, r)
r = await req('/api/ab/personal', { token: annaToken })
const annaAb = r.data?.guid
check('ab/personal', r.status === 200 && annaAb && r.data.rule === 3, r)
r = await req('/api/ab/personal', { token: annaToken })
check('ab/personal стабилен', r.data.guid === annaAb)
r = await req('/api/ab/shared/profiles?current=1&pageSize=100', { token: annaToken })
check('shared/profiles пусто', r.status === 200 && r.data.total === 0 && r.data.data.length === 0, r)
r = await req(`/api/ab/peers?current=1&pageSize=100&ab=${annaAb}`, { token: annaToken })
check('ab/peers пусто', r.status === 200 && r.data.total === 0, r)

r = await req(`/api/ab/peer/add/${annaAb}`, {
  token: annaToken,
  body: { id: '800000001', alias: 'Офис', tags: ['work'], hash: 'h1', password: '', forceAlwaysRelay: 'true', rdpPort: '', rdpUsername: '', note: '' },
})
check('peer/add', r.status === 200 && r.text === '', r)
r = await req(`/api/ab/peer/add/${annaAb}`, { token: annaToken, body: { id: '700000010' } })
check('peer/add своего устройства', r.status === 200)
r = await req(`/api/ab/peers?current=1&pageSize=100&ab=${annaAb}`, { token: annaToken })
const office = r.data.data.find((p) => p.id === '800000001')
const home = r.data.data.find((p) => p.id === '700000010')
check('ab/peers: две записи', r.data.total === 2, r.data)
check('запись: формат клиента', office.alias === 'Офис' && office.tags[0] === 'work' && office.forceAlwaysRelay === 'true' && office.hash === 'h1', office)
check('запись: сведения из устройства', home.hostname === 'ANNA-HOME' && home.username === 'anna' && home.platform === 'Windows', home)
r = await req(`/api/ab/tags/${annaAb}`, { token: annaToken })
check('метка из записи появилась', r.status === 200 && r.data.some((t) => t.name === 'work' && typeof t.color === 'number'), r)

r = await req(`/api/ab/tag/add/${annaAb}`, { token: annaToken, body: { name: 'home', color: 4288585374 } })
check('tag/add', r.status === 200)
r = await req(`/api/ab/tag/add/${annaAb}`, { token: annaToken, body: { name: 'home', color: 1 } })
check('tag/add дубль — ошибка', r.status === 400 && r.data.error, r)
r = await req(`/api/ab/tag/rename/${annaAb}`, { method: 'PUT', token: annaToken, body: { old: 'work', new: 'job' } })
check('tag/rename', r.status === 200)
r = await req(`/api/ab/tag/update/${annaAb}`, { method: 'PUT', token: annaToken, body: { name: 'home', color: 4278238420 } })
check('tag/update', r.status === 200)
r = await req(`/api/ab/peer/update/${annaAb}`, { method: 'PUT', token: annaToken, body: { id: '800000001', alias: 'Офис 2', note: 'заметка', hostname: 'HACK', tags: ['job', 'home'] } })
check('peer/update', r.status === 200)
r = await req(`/api/ab/peers?ab=${annaAb}`, { token: annaToken })
let o = r.data.data.find((p) => p.id === '800000001')
check('peer/update: имя, заметка, метки; hostname не меняется', o.alias === 'Офис 2' && o.note === 'заметка' && o.hostname === '' && o.tags.join() === 'job,home', o)
r = await req(`/api/ab/tags/${annaAb}`, { token: annaToken })
check('переименование метки', r.data.some((t) => t.name === 'job') && !r.data.some((t) => t.name === 'work') && r.data.find((t) => t.name === 'home').color === 4278238420, r.data)
r = await req(`/api/ab/tag/${annaAb}`, { method: 'DELETE', token: annaToken, body: ['home'] })
check('tag delete', r.status === 200)
r = await req(`/api/ab/peers?ab=${annaAb}`, { token: annaToken })
check('удалённая метка снята с записей', r.data.data.find((p) => p.id === '800000001').tags.join() === 'job', r.data)
r = await req(`/api/ab/peer/${annaAb}`, { method: 'DELETE', token: annaToken, body: ['800000001'] })
check('peer delete', r.status === 200)
r = await req(`/api/ab/peers?ab=${annaAb}`, { token: annaToken })
check('после удаления одна запись', r.data.total === 1)

// ---------- старый формат /api/ab
r = await req('/api/ab', { method: 'GET', token: annaToken })
let legacy = JSON.parse(r.data.data)
check('GET /api/ab', r.status === 200 && legacy.peers.length === 1 && typeof legacy.tag_colors === 'string', legacy)
r = await req('/api/ab', {
  token: annaToken,
  body: { data: JSON.stringify({ tags: ['x'], peers: [{ id: '111222333', alias: 'Старый', tags: ['x'], hash: '' }], tag_colors: JSON.stringify({ x: 123 }) }) },
})
check('POST /api/ab', r.status === 200, r)
r = await req('/api/ab', { method: 'GET', token: annaToken })
legacy = JSON.parse(r.data.data)
check('старый формат сохранился', legacy.peers.length === 1 && legacy.peers[0].alias === 'Старый' && JSON.parse(legacy.tag_colors).x === 123, legacy)
r = await req('/api/ab', { token: annaToken, body: { data: 'not json' } })
check('старый формат: кривые данные', r.status === 400, r)

// ---------- чужая книга и общие книги
r = await clientLogin('bob@example.com', 'BobPass1234', '900000001', 'BOB-PC')
const bobToken = r.data.access_token
r = await req(`/api/ab/peers?ab=${annaAb}`, { token: bobToken })
check('чужая личная книга недоступна', r.status === 400 && r.data.error, r)
r = await req(`/api/ab/peer/add/${annaAb}`, { token: bobToken, body: { id: '1' } })
check('в чужую книгу не добавить', r.status === 400)

r = await req('/api/v1/address-books', { who: 'A', body: { action: 'create', name: 'Клиенты' } })
const shared = r.data.guid
check('кабинет: общая книга', r.status === 200 && shared, r)
r = await req('/api/v1/address-books', { who: 'A', body: { action: 'share', guid: shared, email: 'bob@example.com', rule: 1 } })
check('кабинет: доступ Бобу на чтение', r.status === 200, r)
r = await req('/api/v1/address-books', { who: 'A', body: { action: 'share', guid: shared, email: 'nobody@example.com', rule: 1 } })
check('кабинет: доступ несуществующему — 404', r.status === 404, r)
r = await req('/api/v1/address-books', { who: 'A', body: { action: 'share', guid: annaAb, email: 'bob@example.com', rule: 1 } })
check('личной книгой не поделиться', r.status === 400, r)
r = await req('/api/v1/address-books', { who: 'A', body: { action: 'peer-add', guid: shared, id: '555666777', alias: 'Клиент 1', tags: 'vip, срочно' } })
check('кабинет: запись в общую книгу', r.status === 200, r)
r = await req('/api/ab/shared/profiles', { token: bobToken })
const prof = r.data.data?.find((b) => b.guid === shared)
check('Боб видит общую книгу', r.data.total === 1 && prof?.rule === 1 && prof?.owner === 'anna@example.com' && prof?.name === 'Клиенты', r.data)
r = await req(`/api/ab/peers?ab=${shared}`, { token: bobToken })
check('Боб читает записи', r.data.total === 1 && r.data.data[0].tags.join() === 'vip,срочно', r.data)
r = await req(`/api/ab/peer/add/${shared}`, { token: bobToken, body: { id: '1234' } })
check('чтение: добавить нельзя', r.status === 400 && r.data.error === 'Нет доступа', r)
await req('/api/v1/address-books', { who: 'A', body: { action: 'share', guid: shared, email: 'bob@example.com', rule: 2 } })
r = await req(`/api/ab/peer/add/${shared}`, { token: bobToken, body: { id: '1234', alias: 'от Боба' } })
check('запись: добавить можно', r.status === 200, r)
r = await req(`/api/ab/peer/${shared}`, { method: 'DELETE', token: bobToken, body: ['1234'] })
check('запись: удалить нельзя', r.status === 400, r)
r = await req('/api/v1/address-books', { who: 'B', body: { action: 'delete', guid: shared } })
check('чужую книгу не удалить', r.status === 403, r)
r = await req('/api/v1/address-books', { who: 'B', body: { action: 'leave', guid: shared } })
check('Боб отказался от книги', r.status === 200, r)
r = await req('/api/ab/shared/profiles', { token: bobToken })
check('книга ушла от Боба', r.data.total === 0, r.data)

// кабинет: правка записей и меток в своей книге
r = await req('/api/v1/address-books', { who: 'A', body: { action: 'peer-update', guid: annaAb, id: '111222333', alias: 'Новое', tags: 'a, b', note: 'n' } })
check('кабинет: правка записи', r.status === 200, r)
r = await req('/api/v1/address-books', { who: 'A', body: { action: 'tag-color', guid: annaAb, name: 'a', color: '#ff0000' } })
check('кабинет: цвет метки', r.status === 200, r)
r = await req(`/api/ab/tags/${annaAb}`, { token: annaToken })
check('цвет из кабинета в клиенте', r.data.find((t) => t.name === 'a')?.color === 0xffff0000, r.data)
r = await req('/api/v1/address-books', { who: 'B', body: { action: 'peer-add', guid: annaAb, id: '1' } })
check('кабинет: чужая книга — 404', r.status === 404, r)
r = await req('/api/v1/address-books', { body: { action: 'create', name: 'x' } })
check('кабинет: без входа — 401', r.status === 401)

// ---------- доступные устройства
r = await req('/api/users?current=1&pageSize=100&accessible=&status=1', { method: 'GET', token: annaToken })
check('users', r.status === 200 && r.data.total === 1 && r.data.data[0].name === 'anna@example.com', r)
r = await req('/api/peers?current=1&pageSize=100&accessible=', { method: 'GET', token: annaToken })
check('peers', r.status === 200 && r.data.total === 1 && r.data.data[0].id === '700000010' && r.data.data[0].info.device_name === 'ANNA-HOME' && r.data.data[0].info.os === 'Windows 10 Pro', r.data)
r = await req('/api/device-group/accessible?current=1&pageSize=100', { method: 'GET', token: annaToken })
check('device-group', r.status === 200 && r.data.total === 0, r)

// ---------- аудит подключений: управляющую сторону узнаём из второй записи
await req('/api/audit/conn', { body: { action: 'new', id: '700000010', conn_id: 5, ip: '1.2.3.4', uuid: 'x', session_id: 1 } })
let sess = (await readStore()).connSessions.find((x) => x.key === '700000010:5')
check('аудит new: сессия на хозяина', sess && sess.subjectKey === `user:${anna.id}` && sess.ip === '1.2.3.4', sess)
await req('/api/audit/conn', { body: { id: '700000010', conn_id: 5, peer: ['900000001', 'BOB-PC'], type: 0, uuid: 'x', session_id: 1 } })
sess = (await readStore()).connSessions.find((x) => x.key === '700000010:5')
check('аудит peer: сессия переписана на управляющего', sess.controllerId === '900000001' && sess.subjectKey === `user:${bobUser.id}` && sess.controllerName === 'BOB-PC' && sess.connType === 0, sess)
await req('/api/heartbeat', { body: { id: '700000010', uuid: 'dXVpZA==', conns: [5] } })
await new Promise((res) => setTimeout(res, 1100))
await req('/api/heartbeat', { body: { id: '700000010', uuid: 'dXVpZA==', conns: [5] } })
const usage = (await readStore()).usage.find((u) => u.subjectKey === `user:${bobUser.id}`)
check('время пишется управляющему', usage && usage.seconds >= 1, (await readStore()).usage)
r = await req('/api/audit/conn', { body: { action: 'close', id: '700000010', conn_id: 5 } })
check('аудит close', r.status === 200 && (await readStore()).connSessions.find((x) => x.key === '700000010:5').endedAt)

// ---------- передача файлов
r = await req('/api/audit/file', {
  body: { id: '700000010', uuid: 'x', peer_id: '900000001', conn_id: 5, type: 1, path: 'C:\\Users\\anna\\Desktop', is_file: false, info: JSON.stringify({ ip: '1.2.3.4', name: 'BOB-PC', num: 3, files: [['a.txt', 100], ['b.bin', 2048000]] }) },
})
check('audit/file', r.status === 200, r)
const fa = (await readStore()).fileAudits[0]
check('журнал файлов', fa && fa.hostId === '700000010' && fa.controllerName === 'BOB-PC' && fa.num === 3 && fa.files.length === 2 && fa.type === 1, fa)
r = await req('/api/audit/alarm', { body: { id: '700000010', typ: 0, info: '{}' } })
check('audit/alarm', r.status === 200)

// ---------- кабинет
r = await req('/kabinet/adresnaya-kniga', { method: 'GET', who: 'A', raw: true })
check('кабинет: адресная книга', r.status === 200 && r.text.includes('Адресная книга') && r.text.includes('111222333') && r.text.includes('Новое'), r.status)
r = await req(`/kabinet/adresnaya-kniga?ab=${shared}`, { method: 'GET', who: 'A', raw: true })
check('кабинет: общая книга и доступ', r.text.includes('Клиенты') && r.text.includes('Доступ к книге') && r.text.includes('555666777'))
r = await req('/kabinet/ustroystva', { method: 'GET', who: 'A', raw: true })
check('кабинет: устройства и входы', r.text.includes('Где выполнен вход в клиенте') && r.text.includes('PC-ANNA') && r.text.includes('Intel i5'), r.status)
r = await req('/kabinet/istoriya', { method: 'GET', who: 'A', raw: true })
check('кабинет: история с файлами и именем', r.text.includes('Передача файлов') && r.text.includes('Desktop') && r.text.includes('BOB-PC'), r.status)

// ---------- выход
r = await clientLogin('anna@example.com', 'AnnaPass123', '700000011', 'LAPTOP')
const annaToken2 = r.data.access_token
r = await req('/api/logout', { token: annaToken2 })
check('logout', r.status === 200)
r = await req('/api/currentUser', { token: annaToken2 })
check('после logout токен не действует', r.status === 401)
check('первый вход жив', (await req('/api/currentUser', { token: annaToken })).status === 200)
const annaHash = (await readStore()).clientTokens.find((t) => t.userId === anna.id && t.deviceId === '700000010' && !t.revokedAt).tokenHash
r = await req('/api/v1/client-sessions', { who: 'B', body: { action: 'revoke', token: annaHash } })
check('чужой вход не завершить', r.status === 404, r)
r = await req('/api/v1/client-sessions', { who: 'A', body: { action: 'revoke', token: annaHash } })
check('кабинет: завершить вход', r.status === 200)
check('завершённый из кабинета — 401', (await req('/api/currentUser', { token: annaToken })).status === 401)

// ---------- админка
r = await clientLogin('anna@example.com', 'AnnaPass123', '700000010', 'PC-ANNA')
const annaToken3 = r.data.access_token
r = await req('/admin/vhody', { method: 'GET', who: 'ADM', raw: true })
check('админка: входы', r.status === 200 && r.text.includes('anna@example.com') && r.text.includes('PC-ANNA'), r.status)
r = await req('/admin/adresnye-knigi', { method: 'GET', who: 'ADM', raw: true })
check('админка: книги', r.text.includes('Клиенты') && r.text.includes('Личная книга'), r.status)
r = await req(`/admin/adresnye-knigi?ab=${shared}`, { method: 'GET', who: 'ADM', raw: true })
check('админка: записи книги', r.text.includes('555666777'))
r = await req('/admin/fayly', { method: 'GET', who: 'ADM', raw: true })
check('админка: передача файлов', r.text.includes('Desktop') && r.text.includes('2.0 МБ'), r.status)
r = await req('/admin/ustroystva', { method: 'GET', who: 'ADM', raw: true })
check('админка: сведения об устройстве', r.text.includes('Intel i5') && r.text.includes((await readStore()).devices.find((d) => d.rustdeskId === '700000010').lastIp))
r = await req('/admin/vhody', { method: 'GET', who: 'A', raw: true })
check('админка закрыта не-админу', r.status !== 200 || !r.text.includes('Входы в клиенте ·'), r.status)
r = await req('/api/v1/admin/users', { who: 'ADM', body: { action: 'revoke-client', userId: anna.id } })
check('админ: выйти из клиента везде', r.status === 200 && r.data.count >= 1, r)
check('после админа — 401', (await req('/api/currentUser', { token: annaToken3 })).status === 401)

// ---------- сброс пароля завершает входы
r = await clientLogin('bob@example.com', 'BobPass1234', '900000001', 'BOB-PC')
const bobToken2 = r.data.access_token
r = await req('/api/v1/admin/users', { who: 'ADM', body: { action: 'reset-link', userId: bobUser.id } })
const resetToken = r.data.link.split('/').pop()
r = await req('/api/v1/auth/reset/confirm', { body: { token: resetToken, password: 'BobNew12345' }, ip: '10.9.0.1' })
check('сброс пароля', r.status === 200, r)
check('после сброса входы в клиенте закрыты', (await req('/api/currentUser', { token: bobToken2 })).status === 401 && (await req('/api/currentUser', { token: bobToken })).status === 401)
r = await clientLogin('bob@example.com', 'BobNew12345', '900000001', 'BOB-PC')
check('вход новым паролем', r.status === 200)

// ---------- защита от перебора
for (let i = 0; i < 5; i++) await clientLogin('bob@example.com', 'nope-nope', '', 'PC', '10.20.0.1')
r = await clientLogin('bob@example.com', 'BobNew12345', '', 'PC', '10.20.0.2')
check('5 ошибок — 429 с понятным текстом', r.status === 429 && /Слишком много попыток/.test(r.data.error), r)

console.log('OK:\n  ' + ok.join('\n  '))
if (fail.length) {
  console.log('\nFAIL:\n  ' + fail.join('\n  '))
  process.exit(1)
}
console.log(`\nВсе проверки прошли: ${ok.length}`)
