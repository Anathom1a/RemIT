// Мониторинг вживую: настоящие hbbs/hbbr, заглушка Telegram, SMTP-приёмник, сторож.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { session, until, sleep } from '../lib/http.mjs'
import { startHbbr, startHbbs, stopHbbr, stopHbbs } from '../lib/hbb.mjs'

const B = process.env.BASE
const TG = process.env.TELEGRAM_URL
const MAIL = process.env.MAIL_DIR
const INTERVAL = 10_000
const ok = [], fail = []
const check = (label, cond, extra = '') => (cond ? ok : fail).push(`${label} ${typeof extra === 'object' ? JSON.stringify(extra).slice(0, 500) : extra}`)
const tg = async () => (await fetch(TG + '/__log')).json()
const status = async () => (await fetch(B + '/api/status')).json()
const comp = (s, id) => s.components.find((c) => c.id === id)?.status

const admin = session(B, '10.66.0.1')
await admin.post('/api/v1/auth/register', { email: 'admin@remit.su', password: 'AdminPass123', name: 'A' })
const user = session(B, '10.66.0.2')
await user.post('/api/v1/auth/register', { email: 'u@mon.test', password: 'UserPass123', name: 'U' })

// ---------- 1. Первый проход сам, по расписанию
let health = await until(async () => {
  const r = await fetch(B + '/api/health')
  const d = await r.json()
  return r.status === 200 && d.monitorAgeSeconds !== null ? d : null
}, 20_000)
check('health: 200, база, мониторинг идёт сам', health?.ok && health.db === 'up' && health.monitorAgeSeconds < 30, health)
let s = await status()
check('статус: всё работает', s.status === 'operational' && ['site', 'connect', 'relay', 'webclient'].every((id) => comp(s, id) === 'operational'), s)
check('оплата вручную — компонента оплаты нет', !s.components.some((c) => c.id === 'payments'))
check('публичный JSON без адресов и ошибок', !JSON.stringify(s).includes('127.0.0.1') && !JSON.stringify(s).includes('ECONN'))
let msgs = await tg()
check('сертификат сайта недоступен — оповещение сразу', msgs.some((m) => m.text.includes('Сбой: Сертификат') && m.chat_id === '777'), msgs.map((m) => m.text))
await fetch(TG + '/__clear')

// ---------- 2. Падает сервер ID
await stopHbbs()
const t0 = Date.now()
s = await until(async () => { const x = await status(); return comp(x, 'connect') === 'outage' ? x : null })
const took = Date.now() - t0
check('сервер ID упал: компонент «не работает»', comp(s, 'connect') === 'outage' && s.status === 'outage', s?.components)
check('сбой подтверждён не с первой проверки', took > INTERVAL * 0.9, `${took} мс`)
check('веб-клиент тоже (WebSocket hbbs)', comp(s, 'webclient') === 'outage')
check('инцидент опубликован сам', s.active.some((i) => i.components.includes('connect') && i.status === 'investigating'), s.active)
msgs = await until(async () => { const m = await tg(); return m.some((x) => x.text.includes('Сбой: Сервер ID')) ? m : null }, 15_000)
check('оповещение в Telegram о сбое', Boolean(msgs), msgs?.map((m) => m.text))
check('баннер в кабинете', (await user.page('/kabinet')).text.includes('Подключение к компьютерам: нарушена работа'))
let statusHtml = await (await fetch(B + '/status')).text()
check('страница статуса: сбой виден', statusHtml.includes('Сбой в работе сервиса') && statusHtml.includes('нарушена работа'))

// ---------- 3. Восстановление
await fetch(TG + '/__clear')
await startHbbs()
s = await until(async () => { const x = await status(); return comp(x, 'connect') === 'operational' ? x : null })
check('сервер ID восстановлен', comp(s, 'connect') === 'operational' && s.active.length === 0, s?.active)
msgs = await until(async () => { const m = await tg(); return m.some((x) => x.text.includes('Восстановлено: Сервер ID')) ? m : null }, 15_000)
check('оповещение о восстановлении с простоем', msgs?.some((x) => /Восстановлено: Сервер ID.*простой \d+ мин/.test(x.text)), msgs?.map((m) => m.text))
statusHtml = await (await fetch(B + '/status')).text()
check('инцидент ушёл в историю', statusHtml.includes('Работа восстановлена') && statusHtml.includes('История за 2 недели'))
await sleep(500)
const mailFiles = fs.existsSync(MAIL) ? fs.readdirSync(MAIL) : []
check('оповещения и на почту администратору', mailFiles.some((f) => fs.readFileSync(`${MAIL}/${f}`, 'utf8').includes('To: admin@remit.su')), mailFiles.length)

// ---------- 4. Плановые работы глушат оповещения
let r = await admin.post('/api/v1/admin/monitoring', { action: 'incident-create', impact: 'maintenance', title: 'Замена ретранслятора', components: ['relay'], text: 'Меняем сервер, соединения через ретранслятор могут прерываться.' })
let body = r.data
check('плановые работы объявлены', r.status === 200 && body.incident.status === 'in_progress', body)
const maintenanceId = body.incident.id
await fetch(TG + '/__clear')
await stopHbbr()
s = await until(async () => {
  const st = (await admin.get('/api/v1/admin/monitoring')).data
  return st.state.checks['relay:main']?.status === 'down' ? st : null
})
check('ретранслятор упал (видно в админке)', Boolean(s))
s = await status()
check('компонент на обслуживании, а не «сбой»', comp(s, 'relay') === 'maintenance' && s.active.some((i) => i.id === maintenanceId), s.components)
msgs = await tg()
check('по ретранслятору оповещения нет', !msgs.some((m) => m.text.includes('Сбой: Ретранслятор')), msgs.map((m) => m.text))
check('а по WebSocket ретранслятора — есть (не на обслуживании)', msgs.some((m) => m.text.includes('WebSocket ретранслятора')), msgs.map((m) => m.text))
check('автоинцидента по ретрансляции нет', !s.active.some((i) => i.components.includes('relay') && i.id !== maintenanceId))
await startHbbr()
r = await admin.post('/api/v1/admin/monitoring', { action: 'incident-update', id: maintenanceId, status: 'completed' })
check('работы завершены', r.status === 200 && r.data.incident.resolvedAt)
s = await until(async () => { const x = await status(); return comp(x, 'relay') === 'operational' && comp(x, 'webclient') === 'operational' ? x : null })
check('после работ всё зелёное', Boolean(s))

// ---------- 5. Отдельный ретранслятор лёг — частичный сбой, не отказ
r = await admin.post('/api/v1/admin/relays', { action: 'add', address: '127.0.0.1:29117', name: 'Узел Б' })
const nodeId = r.data.relay.id
await admin.post('/api/v1/admin/relays', { action: 'update', id: nodeId, enabled: true })
s = await until(async () => { const x = await status(); return comp(x, 'relay') === 'degraded' ? x : null })
check('один узел из двух лёг — «частичные сбои»', comp(s, 'relay') === 'degraded' && s.status === 'degraded', s?.components)
await admin.post('/api/v1/admin/relays', { action: 'remove', id: nodeId })

// ---------- 6. Инцидент вручную
r = await admin.post('/api/v1/admin/monitoring', { action: 'incident-create', impact: 'minor', title: 'Медленный вход', components: ['site'], text: 'Вход в кабинет занимает до минуты.' })
const manual = r.data.incident
check('ручной инцидент', r.status === 200 && manual.status === 'investigating')
check('неверный статус отклонён', (await admin.post('/api/v1/admin/monitoring', { action: 'incident-update', id: manual.id, status: 'completed' })).status === 400)
await admin.post('/api/v1/admin/monitoring', { action: 'incident-update', id: manual.id, status: 'identified', text: 'Нашли медленный запрос.' })
s = await status()
check('ручной инцидент на странице', s.active.some((i) => i.id === manual.id && i.updates.length === 2))
await admin.post('/api/v1/admin/monitoring', { action: 'incident-update', id: manual.id, status: 'resolved' })
check('без компонентов нельзя', (await admin.post('/api/v1/admin/monitoring', { action: 'incident-create', title: 'x', text: 'y', components: [] })).status === 400)
check('пользователю нельзя', (await user.post('/api/v1/admin/monitoring', { action: 'run' })).status === 403)

// Плановые работы на завтра: в кабинете предупреждение за сутки.
const tomorrow = new Date(Date.now() + 5 * 3600_000).toISOString()
await admin.post('/api/v1/admin/monitoring', { action: 'incident-create', impact: 'maintenance', title: 'Обновление базы', components: ['site'], text: 'Кабинет будет недоступен 15 минут.', startsAt: tomorrow, endsAt: new Date(Date.now() + 6 * 3600_000).toISOString() })
s = await status()
check('запланированные работы — в «Плановые работы»', s.upcoming.some((i) => i.title === 'Обновление базы' && i.status === 'scheduled') && comp(s, 'site') === 'operational')
check('кабинет предупреждает о работах', (await user.page('/kabinet')).text.includes('Плановые работы'))

// ---------- 7. Сторож: сайт лёг и поднялся
await fetch(TG + '/__clear')
let healthy = false
const fakeSite = http.createServer((req, res) => { res.writeHead(healthy ? 200 : 503); res.end('{}') }).listen(3991, '127.0.0.1')
const dog = spawn('sh', [path.join(process.env.REPO_ROOT, 'server/monitor/watchdog.sh')], {
  env: { ...process.env, WATCH_URL: 'http://127.0.0.1:3991/', WATCH_SITE: B, WATCH_INTERVAL: '1', WATCH_THRESHOLD: '2', SERVICE_TOKEN: 'svc-mon', TELEGRAM_BOT_TOKEN: 'bot1', TELEGRAM_CHAT_ID: '777', TELEGRAM_API_URL: TG },
  stdio: 'ignore',
})
msgs = await until(async () => { const m = await tg(); return m.some((x) => x.text.includes('сайт не отвечает')) ? m : null }, 15_000)
check('сторож: тревога после двух провалов', Boolean(msgs), msgs)
await sleep(61_000) // простой больше минуты, чтобы дошёл до статистики
healthy = true
msgs = await until(async () => { const m = await tg(); return m.some((x) => x.text.includes('снова отвечает')) ? m : null }, 15_000)
check('сторож: восстановление', Boolean(msgs), msgs?.map((m) => m.text))
dog.kill()
fakeSite.close()
const st = (await admin.get('/api/v1/admin/monitoring')).data
check('простой записан в события', st.events.some((e) => e.checkId === 'site' && e.status === 'down') && st.events.some((e) => e.checkId === 'site' && e.status === 'up'))
// Три минуты и больше — в историю; сообщим о простое вручную, как сторож.
r = await fetch(B + '/api/v1/monitoring/outage', { method: 'POST', headers: { authorization: 'Bearer svc-mon', 'content-type': 'application/json' }, body: JSON.stringify({ from: new Date(Date.now() - 12 * 60_000).toISOString(), to: new Date(Date.now() - 2 * 60_000).toISOString() }) })
check('отчёт о простое принят', r.status === 200)
check('без токена — нельзя', (await fetch(B + '/api/v1/monitoring/outage', { method: 'POST', body: '{}' })).status === 403)
check('кривой интервал', (await fetch(B + '/api/v1/monitoring/outage', { method: 'POST', headers: { authorization: 'Bearer svc-mon' }, body: JSON.stringify({ from: new Date().toISOString(), to: new Date(Date.now() - 1000).toISOString() }) })).status === 400)
s = await status()
const site = s.components.find((c) => c.id === 'site')
check('доступность сайта учла простой', site.uptime90 !== null && site.uptime90 < 1, site.uptime90)
statusHtml = await (await fetch(B + '/status')).text()
check('в истории — «были недоступны»', statusHtml.includes('Сайт и личный кабинет были недоступны'))

// ---------- 8. Админка
const text = (await admin.page('/admin/monitoring')).text
check('админка: проверки и события', text.includes('Сервер ID (hbbs)') && text.includes('База данных') && text.includes('События') && text.includes('Устройств онлайн'))
await fetch(TG + '/__clear')
r = await admin.post('/api/v1/admin/monitoring', { action: 'test-alert' })
body = r.data
check('тестовое оповещение: Telegram и почта', r.status === 200 && body.telegram && body.email, body)
check('тест дошёл до Telegram', (await tg()).some((m) => m.text.includes('Тестовое оповещение')))

console.log('OK:\n  ' + ok.join('\n  '))
console.log('FAIL:\n  ' + fail.join('\n  '))
console.log(`${ok.length} ok, ${fail.length} fail`)
process.exit(fail.length ? 1 : 0)
