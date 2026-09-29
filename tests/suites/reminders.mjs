// Напоминания об окончании подписки без автопродления: за 7 дней, за день,
// после окончания; у пробного периода — за 3 дня; без повторов; продление
// начинает цикл заново; автопродление, только что оформленная подписка,
// заблокированный аккаунт и давно закончившаяся подписка — без писем.
import { checker, session, sleep } from '../lib/http.mjs'
import { editStore, readStore } from '../lib/store.mjs'
import { mailsTo } from '../lib/mail.mjs'

const B = process.env.BASE
const { check, finish } = checker()
const DAY = 86400000
const jobs = async () =>
  (await (await fetch(B + '/api/v1/billing/jobs', { method: 'POST', headers: { authorization: 'Bearer svc-rem' } })).json()).report

const admin = session(B, '10.60.0.1')
await admin.post('/api/v1/auth/register', { email: 'admin@remit.su', password: 'AdminPass123', name: 'A' })

async function account(email, n) {
  const who = session(B, `10.60.0.${n}`)
  await who.post('/api/v1/auth/register', { email, password: 'Passw0rd!x', name: 'Тест' })
  return (await readStore()).users.find((user) => user.email === email)
}
// Письма-напоминания (без письма подтверждения почты) и их текст.
const reminders = (email) => mailsTo(email).filter((mail) => !mail.subject.includes('Подтвердите'))
function bodyOf(mail) {
  const raw = mail.raw.replace(/=\r?\n/g, '')
  const base64 = raw.match(/(?:^[A-Za-z0-9+/=]{16,}\r?\n)+/gm) ?? []
  return raw + base64.map((block) => Buffer.from(block.replace(/\s+/g, ''), 'base64').toString('utf8')).join('\n')
}
const subOf = async (userId) =>
  (await readStore()).subscriptions.filter((sub) => sub.userId === userId && sub.status === 'active').sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0]
// Сдвигает подписку: закончится через leftMs, началась startedAgoMs назад.
async function shift(userId, leftMs, startedAgoMs = 20 * DAY, extra = {}) {
  await editStore((s) => {
    const sub = s.subscriptions
      .filter((item) => item.userId === userId && item.status === 'active')
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0]
    sub.expiresAt = new Date(Date.now() + leftMs).toISOString()
    sub.startedAt = new Date(Date.now() - startedAgoMs).toISOString()
    Object.assign(sub, extra)
  })
}
const subjects = (email) => reminders(email).map((mail) => mail.subject)
const grant = (userId, plan = 'pro', months = 1) => admin.post('/api/v1/admin/subscriptions', { action: 'grant', userId, plan, months })

// ---------- оплаченная подписка: 7 дней → день → закончилась
const anna = await account('anna@remind.test', 2)
await grant(anna.id)
await shift(anna.id, 6 * DAY)
let report = await jobs()
await sleep(300)
check('за неделю: напоминание', report.reminders === 1 && subjects('anna@remind.test').some((s) => s.includes('подписка заканчивается') && /\d\d\.\d\d\.\d{4}/.test(s)), { report, subjects: subjects('anna@remind.test') })
let mail = bodyOf(reminders('anna@remind.test').at(-1))
check('в письме: тариф, бесплатный тариф, ссылка', mail.includes('/kabinet/podpiska') && mail.includes('«Профи»') && mail.includes('бесплатного тарифа'), mail.slice(-600))
report = await jobs()
check('повторно не шлём', report.reminders === 0 && reminders('anna@remind.test').length === 1, report)

await shift(anna.id, 20 * 3600 * 1000)
report = await jobs()
await sleep(300)
check('за день: «заканчивается завтра»', report.reminders === 1 && subjects('anna@remind.test').at(-1).includes('заканчивается завтра'), subjects('anna@remind.test'))
report = await jobs()
check('и его — один раз', report.reminders === 0)

await shift(anna.id, -3600 * 1000)
report = await jobs()
await sleep(300)
check('после окончания: «подписка закончилась»', report.reminders === 1 && subjects('anna@remind.test').at(-1).includes('подписка закончилась'), subjects('anna@remind.test'))
report = await jobs()
check('тоже один раз', report.reminders === 0 && reminders('anna@remind.test').length === 3)

// Продление начинает цикл заново: новая дата окончания.
await grant(anna.id)
await shift(anna.id, 5 * DAY)
report = await jobs()
check('после продления — снова за неделю', report.reminders === 1 && reminders('anna@remind.test').length === 4, report)

// ---------- сразу «за день», если неделю пропустили: раннее уже не шлём
const bob = await account('bob@remind.test', 3)
await grant(bob.id)
await shift(bob.id, 10 * 3600 * 1000)
report = await jobs()
await sleep(300)
check('пропущенная неделя: только «завтра»', subjects('bob@remind.test').length === 1 && subjects('bob@remind.test')[0].includes('завтра'), subjects('bob@remind.test'))

// ---------- пробный период
const tina = await account('tina@remind.test', 4)
await admin.post('/api/v1/admin/subscriptions', { action: 'trial', userId: tina.id, plan: 'business', days: 14 })
await shift(tina.id, 2.5 * DAY, 11 * DAY)
report = await jobs()
await sleep(300)
check('пробный: за 3 дня', subjects('tina@remind.test').some((s) => s.includes('пробный период заканчивается')), subjects('tina@remind.test'))
check('пробный: про выбор тарифа', bodyOf(reminders('tina@remind.test').at(-1)).includes('выберите тариф'))
await shift(tina.id, 5 * DAY, 9 * DAY)
report = await jobs()
check('пробный: за 5 дней ещё рано', reminders('tina@remind.test').length === 1)
await shift(tina.id, -DAY, 15 * DAY)
report = await jobs()
await sleep(300)
check('пробный закончился', subjects('tina@remind.test').at(-1).includes('пробный период закончился'), subjects('tina@remind.test'))

// ---------- кому не пишем
const carl = await account('carl@remind.test', 5)
await grant(carl.id)
await shift(carl.id, 3 * DAY, 20 * DAY, { autoRenew: true })
const dina = await account('dina@remind.test', 6)
await grant(dina.id)
await shift(dina.id, 20 * 3600 * 1000, 3600 * 1000)
const eva = await account('eva@remind.test', 7)
await grant(eva.id)
await shift(eva.id, -5 * DAY)
const fred = await account('fred@remind.test', 8)
await grant(fred.id)
await shift(fred.id, 3 * DAY)
await admin.post('/api/v1/admin/users', { userId: fred.id, action: 'block' })
report = await jobs()
await sleep(300)
check('с автопродлением — не пишем (у них свои письма)', reminders('carl@remind.test').length === 0)
check('только что оформленной — не пишем', reminders('dina@remind.test').length === 0)
check('закончилась давно — не пишем', reminders('eva@remind.test').length === 0)
check('заблокированному — не пишем', reminders('fred@remind.test').length === 0)
check('отметка есть и у пропущенных — письма не придут позже пачкой', Boolean((await subOf(fred.id)).expiryNoticeFor), await subOf(fred.id))

// ---------- админка показывает итог
const text = (await admin.page('/admin/platezhi')).text
check('админка: напоминания в отчёте', text.includes('напоминаний'), text.match(/Последний запуск.{0,200}/)?.[0])

finish()
