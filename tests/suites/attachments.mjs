import { deflateSync } from 'node:zlib'
import { readStore } from '../lib/store.mjs'
const BASE = process.env.BASE
const jar = new Map()
const ok = [], fail = []
const check = (label, cond, extra = '') => (cond ? ok : fail).push(`${label} ${extra}`)

async function req(name, path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { cookie: jar.get(name) ?? '', ...(init.headers ?? {}) },
    redirect: 'manual',
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) jar.set(name, set.map((c) => c.split(';')[0]).join('; '))
  return res
}
async function json(name, path, init = {}) {
  const res = await req(name, path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text.slice(0, 200) }
  return { status: res.status, body }
}

// Настоящий однопиксельный PNG: сигнатуру проверяет сервер.
function png() {
  const crc32 = (buf) => {
    let c, crc = 0xffffffff
    for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = c ^ (crc >>> 8) }
    return (crc ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const idat = deflateSync(Buffer.from([0, 255, 0, 0]))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ])
}

// 1. Аккаунты
let r = await json('user', '/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'u1@example.com', password: 'Password123', name: 'Клиент' }) })
check('регистрация клиента', r.status === 200, r.status)
r = await json('other', '/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'u2@example.com', password: 'Password123', name: 'Второй' }) })
check('регистрация второго клиента', r.status === 200, r.status)
r = await json('admin', '/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'admin@remit.su', password: 'Password123', name: 'Админ' }) })
check('регистрация админа', r.status === 200, r.status)

// 2. Обращение со скриншотом (multipart)
const form = new FormData()
form.set('subject', 'Чёрный экран при подключении')
form.set('message', 'Прикладываю скриншот того, что вижу при подключении.')
form.append('files', new Blob([png()], { type: 'image/png' }), 'скрин.png')
let res = await req('user', '/api/v1/support/tickets', { method: 'POST', body: form })
let data = await res.json()
check('обращение со скриншотом принято', res.status === 200, JSON.stringify(data).slice(0, 200))
const ticket = data.ticket
check('вложение записано', ticket?.attachments?.length === 1, JSON.stringify(ticket?.attachments))
check('имя задано сервером по формату', ticket?.attachments?.[0]?.name === '1.png', ticket?.attachments?.[0]?.name)
const url = ticket?.attachments?.[0]?.url

// 3. Автор видит файл
res = await req('user', url)
check('автор открывает вложение', res.status === 200 && res.headers.get('content-type') === 'image/png', `${res.status} ${res.headers.get('content-type')}`)
check('браузеру запрещено угадывать тип', res.headers.get('x-content-type-options') === 'nosniff', res.headers.get('x-content-type-options'))
check('вложение не кешируется публично', (res.headers.get('cache-control') ?? '').includes('private'), res.headers.get('cache-control'))

// 4. Чужой не видит
res = await req('other', url)
check('чужому вложение закрыто', res.status === 403, res.status)
res = await fetch(BASE + url, { redirect: 'manual' })
check('анониму вложение закрыто', res.status === 401, res.status)

// 5. Админ видит
res = await req('admin', url)
check('поддержка открывает вложение', res.status === 200, res.status)

// 6. Не картинка — отказ
const bad = new FormData()
bad.set('subject', 'Попытка подсунуть html')
bad.set('message', 'Файл с расширением png, но внутри страница со скриптом.')
bad.append('files', new Blob(['<html><script>alert(1)</script>'], { type: 'image/png' }), 'evil.png')
res = await req('user', '/api/v1/support/tickets', { method: 'POST', body: bad })
check('подделка по расширению отклонена', res.status === 415, res.status)

// 7. Слишком много файлов
const many = new FormData()
many.set('subject', 'Много файлов')
many.set('message', 'Проверяем ограничение на число вложений.')
for (let i = 0; i < 6; i++) many.append('files', new Blob([png()], { type: 'image/png' }), `s${i}.png`)
res = await req('user', '/api/v1/support/tickets', { method: 'POST', body: many })
check('лишние файлы отклонены', res.status === 400, res.status)

// 8. JSON по-прежнему работает
r = await json('user', '/api/v1/support/tickets', { method: 'POST', body: JSON.stringify({ subject: 'Без файлов', message: 'Обычное обращение без вложений.' }) })
check('обращение без файлов принято', r.status === 200 && r.body.ticket?.attachments?.length === 0, JSON.stringify(r.body).slice(0, 120))

// 9. Несуществующее имя файла
res = await req('user', `/api/v1/support/attachments/${ticket.id}/7.png`)
check('файла нет в обращении — 404', res.status === 404, res.status)
res = await req('user', `/api/v1/support/attachments/${ticket.id}/..%2F..%2Fstore.json`)
check('выход из каталога не проходит', res.status === 404 || res.status === 400, res.status)

// 10. Страница загрузки: определение ОС и спойлер
const UAS = {
  Windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  macOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15',
  Linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  iOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17 Mobile Safari/604.1',
}
const EXPECT = { Windows: 'Windows', macOS: 'macOS', Linux: 'Linux', Android: 'Android' }
for (const [name, ua] of Object.entries(UAS)) {
  const page = await (await fetch(BASE + '/skachat', { headers: { 'user-agent': ua } })).text()
  // Значение приходит и в html, и в полезной нагрузке RSC, где кавычки экранированы.
  const hint = page.match(/Похоже, у вас[\\"\s,]*([A-Za-zА-Яа-я]+)/)?.[1]
  if (name === 'iOS') {
    check('на iPhone предлагаем компьютер', page.includes('Для iPhone и iPad'), hint ?? '')
  } else {
    check(`определяется ${name}`, hint === EXPECT[name], `подсказка: ${hint}`)
  }
  check(`${name}: есть спойлер с другими системами`, page.includes('Скачать для другой системы'))
}

console.log('OK:\n  ' + ok.join('\n  '))
if (fail.length) { console.log('\nПРОВАЛЫ:\n  ' + fail.join('\n  ')); process.exit(1) }
console.log('\nВсе проверки прошли')
