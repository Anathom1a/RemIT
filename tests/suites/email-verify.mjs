// Подтверждение почты: письмо со ссылкой, повторная отправка и её лимит,
// запрет оплаты до подтверждения, ручное подтверждение в админке, VK ID.
import fs from 'node:fs'
import path from 'node:path'
import { checker, session, sleep, until } from '../lib/http.mjs'
import { readStore } from '../lib/store.mjs'

const B = process.env.BASE
const MAIL = process.env.MAIL_DIR
const VK = process.env.VK_URL
const { check, finish } = checker()

const mails = (to) =>
  fs.existsSync(MAIL)
    ? fs.readdirSync(MAIL).sort().map((file) => fs.readFileSync(path.join(MAIL, file), 'utf8')).filter((eml) => eml.includes(`To: ${to}`))
    : []
const linkIn = (eml) => eml.replace(/=\r?\n/g, '').replace(/=3D/g, '=').match(/https?:\/\/[^\s"<]+\/podtverzhdenie\/[A-Za-z0-9_-]+/)?.[0]
const userOf = async (email) => (await readStore()).users.find((user) => user.email === email)

// ---------- регистрация: письмо со ссылкой
const anna = session(B, '10.30.0.1')
let r = await anna.post('/api/v1/auth/register', { email: 'anna@verify.test', password: 'AnnaPass123', name: 'Анна' })
check('регистрация', r.status === 200, r.status)
const first = await until(async () => mails('anna@verify.test')[0], 10_000, 300)
const firstLink = first && linkIn(first)
check('письмо со ссылкой подтверждения', Boolean(firstLink), first?.slice(0, 300))
check('почта ещё не подтверждена', (await userOf('anna@verify.test')).emailVerifiedAt === null)
let page = await anna.page('/kabinet')
check('баннер в кабинете', page.text.includes('Подтвердите почту') && page.text.includes('anna@verify.test'))

// ---------- до подтверждения платить нельзя
r = await anna.post('/api/v1/billing/checkout', { plan: 'pro', months: 1 })
check('оплата закрыта', r.status === 403 && r.data?.code === 'email_unverified' && r.data.error.includes('Подтвердите почту'), r.data)
r = await anna.post('/api/v1/billing/upgrade', { plan: 'business' })
check('доплата закрыта', r.status === 403 && r.data?.code === 'email_unverified', r.data)

// ---------- повторная отправка и лимит (3 письма в час вместе с первым)
r = await anna.post('/api/v1/auth/verify')
check('повторное письмо', r.status === 200, r.data)
r = await anna.post('/api/v1/auth/verify')
check('ещё одно', r.status === 200, r.data)
r = await anna.post('/api/v1/auth/verify')
check('четвёртое за час — отказ', r.status === 429 && r.data.error.includes('через час'), r.data)
await sleep(500)
check('писем ровно три', mails('anna@verify.test').length === 3, mails('anna@verify.test').length)
check('без входа — нельзя', (await fetch(B + '/api/v1/auth/verify', { method: 'POST' })).status === 401)

// ---------- переход по ссылке
page = await anna.page(new URL(firstLink).pathname)
check('страница: почта подтверждена', page.status === 200 && page.text.includes('Почта подтверждена'), page.text.slice(0, 200))
check('страница без referrer', page.html.includes('name="referrer" content="no-referrer"'))
check('в базе отметка', Boolean((await userOf('anna@verify.test')).emailVerifiedAt))
page = await anna.page(new URL(firstLink).pathname)
check('ссылка одноразовая', page.text.includes('Ссылка не действует'))
check('кривая ссылка', (await anna.page('/podtverzhdenie/nonsense')).text.includes('Ссылка не действует'))
check('баннер пропал', !(await anna.page('/kabinet')).text.includes('Подтвердите почту'))
r = await anna.post('/api/v1/auth/verify')
check('уже подтверждена — писем не шлём', r.status === 200 && r.data.already === true)
r = await anna.post('/api/v1/billing/checkout', { plan: 'pro', months: 1 })
check('оплата открыта', r.status === 200 && r.data.redirectUrl, r.data)

// ---------- ручное подтверждение в админке
const admin = session(B, '10.30.0.2')
await admin.post('/api/v1/auth/register', { email: 'admin@remit.su', password: 'AdminPass123', name: 'A' })
const bob = session(B, '10.30.0.3')
await bob.post('/api/v1/auth/register', { email: 'bob@verify.test', password: 'BobPass1234', name: 'Боб' })
const bobUser = await userOf('bob@verify.test')
check('не-админ подтвердить не может', [401, 403].includes((await bob.post('/api/v1/admin/users', { userId: bobUser.id, action: 'verify-email' })).status))
page = await admin.page('/admin/polzovateli?q=bob')
check('админка: отметка «не подтверждена»', page.text.includes('почта не подтверждена') && page.text.includes('Подтвердить почту'))
r = await admin.post('/api/v1/admin/users', { userId: bobUser.id, action: 'verify-email' })
check('админ подтвердил вручную', r.status === 200 && Boolean((await userOf('bob@verify.test')).emailVerifiedAt), r.data)

// ---------- VK ID: подтверждённая почта — привязка сама, новая — сразу подтверждена
async function vkFlow(who, profile) {
  await fetch(VK + '/__set', { method: 'POST', body: JSON.stringify(profile) })
  const start = await who.get('/api/v1/auth/vk/start?action=login')
  const authorize = await fetch(start.headers.get('location'), { redirect: 'manual' })
  return who.get(authorize.headers.get('location'))
}
const viaVk = session(B, '10.30.0.4')
r = await vkFlow(viaVk, { user_id: 5005, first_name: 'Анна', last_name: 'VK', email: 'anna@verify.test' })
check('VK: подтверждённая почта — вход в тот же аккаунт', r.status === 303 && r.headers.get('location').endsWith('/kabinet'), r.headers.get('location'))
const identities = (await readStore()).oauthIdentities
const annaId = (await userOf('anna@verify.test')).id
check('VK: профиль привязан к аккаунту', identities.some((item) => item.subject === '5005' && item.userId === annaId))
const carl = session(B, '10.30.0.5')
await carl.post('/api/v1/auth/register', { email: 'carl@verify.test', password: 'CarlPass123', name: 'Карл' })
r = await vkFlow(session(B, '10.30.0.6'), { user_id: 6006, first_name: 'Не', last_name: 'Карл', email: 'carl@verify.test' })
check('VK: неподтверждённую почту не забираем', decodeURIComponent(r.headers.get('location') ?? '').includes('не подтверждена'), r.headers.get('location'))
r = await vkFlow(session(B, '10.30.0.7'), { user_id: 7007, first_name: 'Новый', last_name: 'VK', email: 'new-vk@verify.test' })
check('VK: новый аккаунт сразу с подтверждённой почтой', Boolean((await userOf('new-vk@verify.test'))?.emailVerifiedAt))
check('VK: новому письмо не шлём', mails('new-vk@verify.test').length === 0)

finish()
