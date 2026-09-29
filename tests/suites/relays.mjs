// Ретрансляторы: список из админки уходит в hbbs, hbbs чередует узлы и
// исключает упавшие, после перезапуска hbbs сайт возвращает список.
// Настоящие hbbs и hbbr; команды — по сети с токеном (патч server-cmd-hook).
import net from 'node:net'
import { checker, session, sleep } from '../lib/http.mjs'
import { publicKey, startHbbr, startHbbs, stopHbbr } from '../lib/hbb.mjs'

const HOST = process.env.HOST_IP
const TOKEN = process.env.HBB_TOKEN
const { check, finish } = checker()
const main = `${HOST}:21117`
const nodeAddress = `${HOST}:22117`

const cmd = (port, token, line) =>
  new Promise((resolve) => {
    const socket = net.connect(port, HOST, () => socket.write(`REMIT-CMD ${token}\n${line}`))
    let out = ''
    socket.on('data', (data) => (out += data))
    socket.on('close', () => resolve(out))
    socket.on('error', () => resolve('ERR'))
    setTimeout(() => { socket.destroy(); resolve(out) }, 3000)
  })
const rs = async () => (await cmd(21115, TOKEN, 'rs')).trim()

const admin = session(process.env.BASE, '10.9.0.1')
await admin.post('/api/v1/auth/register', { email: 'admin@remit.su', password: 'AdminPass123', name: 'A' })
const user = session(process.env.BASE, '10.9.0.2')
await user.post('/api/v1/auth/register', { email: 'u@example.com', password: 'UserPass123', name: 'U' })
const act = (who, data) => who.post('/api/v1/admin/relays', data)

check('обычный пользователь не пускается', [401, 403].includes((await act(user, { action: 'apply' })).status))
let list = (await admin.get('/api/v1/admin/relays')).data
check('основной узел в списке и отвечает', list.relays.length === 1 && list.relays[0].id === 'main' && list.relays[0].tcp.ok, list.relays[0]?.tcp)
check('плохой адрес отклонён', (await act(admin, { action: 'add', address: 'bad host!' })).status === 400)
const added = await act(admin, { action: 'add', address: nodeAddress, name: 'Узел Б', region: 'Москва' })
check('узел добавлен выключенным', added.status === 200 && added.data.relay.enabled === false, added.data)
check('дубликат отклонён', (await act(admin, { action: 'add', address: nodeAddress })).status === 400)
const install = added.data.install
const token = install.match(/--token (\w+)/)?.[1]
check(
  'команда установки с ключом, портом и токеном',
  install.includes(`--domain ${HOST}`) && install.includes('--port 22117') && install.includes(`--key '${publicKey()}'`) && token?.length === 64,
  install,
)
const id = added.data.relay.id
list = (await admin.get('/api/v1/admin/relays')).data
check('узел ещё не установлен — не отвечает', list.relays[1].tcp.ok === false && list.relays[1].tls === null)

// «Устанавливаем» узел: hbbr на 22117 со своим токеном.
await startHbbr({ name: 'node', port: 22117, token })
list = (await admin.get('/api/v1/admin/relays')).data
check('установленный узел отвечает', list.relays[1].tcp.ok, list.relays[1].tcp)
const help = await act(admin, { action: 'command', id, command: 'h' })
check('команда узлу по его токену', help.status === 200 && /usage/.test(help.data.output), help.data)
check('узел не принимает токен основного сервера', !/usage/.test(await cmd(22117, TOKEN, 'h')))
check('недопустимая команда отклонена', (await act(admin, { action: 'command', id, command: 'rm -rf' })).status === 400)

const enabled = await act(admin, { action: 'update', id, enabled: true })
check('включение передаёт список в hbbs', enabled.status === 200 && enabled.data.hbbs.ok, enabled.data.hbbs)
let current = (await rs()).split('\n')
check('hbbs раздаёт оба узла', current.includes(main) && current.includes(nodeAddress), current)
const picks = new Set()
for (let index = 0; index < 4; index += 1) picks.add((await cmd(21115, TOKEN, 'tg 1.1.1.1 2.2.2.2')).trim())
check('hbbs чередует ретрансляторы', picks.size === 2, [...picks])

check(
  'нельзя выключить все',
  (await act(admin, { action: 'update', id: 'main', enabled: false })).status === 200 &&
    (await act(admin, { action: 'update', id, enabled: false })).status === 400,
)
check('основной выключен — hbbs раздаёт только узел', (await rs()) === nodeAddress, await rs())
check('основной узел не удалить', (await act(admin, { action: 'remove', id: 'main' })).status === 400)
await act(admin, { action: 'update', id: 'main', enabled: true })

// Узел упал: hbbs сам исключает, сверка не считает это расхождением.
await stopHbbr('node', 22117)
await sleep(7000)
check('hbbs исключил упавший узел', (await rs()) === main, await rs())
let sync = await act(admin, { action: 'sync' })
check('сверка не трогает упавший узел', sync.data.hbbs.ok && !sync.data.hbbs.applied, sync.data.hbbs)

await startHbbr({ name: 'node', port: 22117, token })
await sleep(4000)
check('поднявшийся узел hbbs вернул сам', (await rs()).includes('22117'), await rs())

// Перезапуск hbbs: забывает список, сверка возвращает.
await startHbbs()
await sleep(1000)
check('после перезапуска hbbs знает только RELAY', (await rs()) === main, await rs())
sync = await act(admin, { action: 'sync' })
check('сверка вернула список', sync.data.hbbs.applied && (await rs()).includes('22117'), sync.data.hbbs)

const page = await admin.page('/admin/retranslyatory')
check('страница админки', page.status === 200 && page.text.includes('Узел Б') && page.text.includes('Что раздаёт hbbs'))
const removed = await act(admin, { action: 'remove', id })
check('удаление узла', removed.status === 200 && (await rs()) === main)
await stopHbbr('node', 22117)
finish()
