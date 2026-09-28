import { randomBytes, randomUUID } from 'node:crypto'
import { config } from './config'
import { getStore } from './store'
import { openSecret, sealSecret } from './secret-box'
import { ServerCmdError, sendCommandTo, sendServerCommand } from './server-cmd'

/**
 * Ретрансляторы (hbbr). Первый — на основном сервере, остальные — отдельные
 * машины, которые администратор подключает в админке.
 *
 * Как это работает:
 *   - клиент RemIT не знает адрес ретранслятора: при каждом соединении его
 *     назначает hbbs (в клиенте relay-server закреплён пустым);
 *   - hbbs получает список командой `rs <адрес,адрес>`, раздаёт ретрансляторы
 *     по кругу и каждые 3 секунды исключает те, что не отвечают;
 *   - после перезапуска hbbs забывает список и берёт RELAY из окружения,
 *     поэтому сайт сверяет список попутно с heartbeat (reconcileRelays) и
 *     возвращает его сам.
 *
 * У каждого дополнительного узла свой токен команд: утечка одного узла не
 * даёт управлять остальными и основным сервером. Токен хранится
 * зашифрованным REMIT_AUTH_SECRET.
 */

export const MAIN_RELAY_ID = 'main'
const NODES_KEY = 'relay_nodes'
const TOKEN_PURPOSE = 'relay-token'
const MAX_NODES = 20
const RECONCILE_EVERY_MS = 5 * 60_000

export interface RelayNode {
  id: string
  /** host:port — в таком виде адрес получают клиенты. */
  address: string
  name: string
  region: string
  enabled: boolean
  createdAt: string
}

interface StoredNode extends RelayNode {
  tokenSealed: string
}

export class RelayError extends Error {
  status = 400
}

function mainNode(stored?: StoredNode): StoredNode {
  return {
    id: MAIN_RELAY_ID,
    address: config.rustdesk.relayServer,
    name: stored?.name || 'Основной сервер',
    region: stored?.region ?? '',
    enabled: stored?.enabled ?? true,
    createdAt: stored?.createdAt ?? '',
    tokenSealed: '',
  }
}

async function readNodes(): Promise<StoredNode[]> {
  const store = await getStore()
  const raw = (await store.getSettings())[NODES_KEY]
  let stored: StoredNode[] = []
  try {
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) stored = parsed as StoredNode[]
  } catch {
    stored = []
  }
  const main = stored.find((node) => node.id === MAIN_RELAY_ID)
  return [mainNode(main), ...stored.filter((node) => node.id !== MAIN_RELAY_ID)]
}

async function writeNodes(nodes: StoredNode[]): Promise<void> {
  const store = await getStore()
  // Адрес основного узла не храним: он всегда из REMIT_RELAY_SERVER.
  const clean = nodes.map((node) => (node.id === MAIN_RELAY_ID ? { ...node, address: '' } : node))
  await store.setSetting(NODES_KEY, JSON.stringify(clean))
}

const publicNode = ({ tokenSealed: _token, ...node }: StoredNode): RelayNode => node

export async function listRelays(): Promise<RelayNode[]> {
  return (await readNodes()).map(publicNode)
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

/** «relay1.remit.su», «relay1.remit.su:21117» → «relay1.remit.su:21117». */
export function normalizeRelayAddress(input: string): string {
  const value = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '')
  const [host, portText, extra] = value.split(':')
  if (extra !== undefined || !host) throw new RelayError('Укажите адрес в виде relay1.remit.su или relay1.remit.su:21117')
  if (!HOST_RE.test(host) && !IPV4_RE.test(host)) throw new RelayError('Некорректное имя узла')
  const port = portText === undefined || portText === '' ? 21117 : Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > 65533) throw new RelayError('Некорректный порт')
  return `${host}:${port}`
}

export const isIpAddress = (address: string) => IPV4_RE.test(address.split(':')[0])

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Новый узел. Токен команд возвращается, чтобы показать команду установки. */
export async function addRelay(input: { address: unknown; name?: unknown; region?: unknown }): Promise<RelayNode> {
  const address = normalizeRelayAddress(String(input.address ?? ''))
  const nodes = await readNodes()
  if (nodes.length > MAX_NODES) throw new RelayError(`Не больше ${MAX_NODES} ретрансляторов`)
  if (nodes.some((node) => node.address === address)) throw new RelayError('Такой ретранслятор уже есть')

  const node: StoredNode = {
    id: randomUUID(),
    address,
    name: cleanText(input.name, 60) || address.split(':')[0],
    region: cleanText(input.region, 60),
    // Новый узел включается после проверки: сначала его надо установить.
    enabled: false,
    createdAt: new Date().toISOString(),
    tokenSealed: sealSecret(randomBytes(32).toString('hex'), TOKEN_PURPOSE),
  }
  await writeNodes([...nodes, node])
  return publicNode(node)
}

export async function updateRelay(
  id: string,
  patch: { enabled?: unknown; name?: unknown; region?: unknown },
): Promise<RelayNode> {
  const nodes = await readNodes()
  const node = nodes.find((item) => item.id === id)
  if (!node) throw new RelayError('Ретранслятор не найден')

  if (typeof patch.enabled === 'boolean') node.enabled = patch.enabled
  if (patch.name !== undefined) node.name = cleanText(patch.name, 60) || node.name
  if (patch.region !== undefined) node.region = cleanText(patch.region, 60)
  if (!nodes.some((item) => item.enabled)) throw new RelayError('Хотя бы один ретранслятор должен остаться включённым')

  await writeNodes(nodes)
  return publicNode(node)
}

export async function removeRelay(id: string): Promise<void> {
  if (id === MAIN_RELAY_ID) throw new RelayError('Ретранслятор основного сервера не удалить — его можно выключить')
  const nodes = await readNodes()
  const rest = nodes.filter((node) => node.id !== id)
  if (rest.length === nodes.length) throw new RelayError('Ретранслятор не найден')
  if (!rest.some((node) => node.enabled)) throw new RelayError('Хотя бы один ретранслятор должен остаться включённым')
  await writeNodes(rest)
}

/** Токен команд узла; у основного — REMIT_SERVICE_TOKEN. */
async function nodeToken(node: StoredNode): Promise<string> {
  if (node.id === MAIN_RELAY_ID) return config.serviceToken
  const token = openSecret(node.tokenSealed, TOKEN_PURPOSE)
  if (!token) throw new RelayError('Токен узла не расшифровать (сменили REMIT_AUTH_SECRET?) — удалите узел и добавьте заново')
  return token
}

async function findNode(id: string): Promise<StoredNode> {
  const node = (await readNodes()).find((item) => item.id === id)
  if (!node) throw new RelayError('Ретранслятор не найден')
  return node
}

/** Команда установки узла — показывается администратору. */
export async function relayInstallCommand(id: string): Promise<string> {
  const node = await findNode(id)
  if (node.id === MAIN_RELAY_ID) return ''
  const token = await nodeToken(node)
  const [host, port] = node.address.split(':')
  return [
    'sudo bash server/deploy-relay.sh \\',
    `  --domain ${host} \\`,
    ...(port !== '21117' ? [`  --port ${port} \\`] : []),
    `  --key '${config.rustdesk.publicKey || '<RUSTDESK_PUBLIC_KEY>'}' \\`,
    `  --token ${token}`,
  ].join('\n')
}

/** Служебная команда hbbr на узле (usage, limit-speed, blocklist…). */
export async function relayCommand(id: string, line: string): Promise<string> {
  const node = await findNode(id)
  const address = node.id === MAIN_RELAY_ID ? config.rustdesk.hbbrCommand : node.address
  return sendCommandTo({ address, token: await nodeToken(node), target: 'hbbr', line, label: node.name })
}

export interface ProbeResult {
  ok: boolean
  ms: number
  detail: string
}

function probeTcp(address: string, timeoutMs = 3000): Promise<ProbeResult> {
  const separator = address.lastIndexOf(':')
  const host = address.slice(0, separator)
  const port = Number(address.slice(separator + 1))
  return import('node:net').then(
    ({ Socket }) =>
      new Promise((resolve) => {
        const socket = new Socket()
        const started = Date.now()
        const done = (ok: boolean, detail: string) => {
          socket.destroy()
          resolve({ ok, ms: Date.now() - started, detail })
        }
        socket.setTimeout(timeoutMs)
        socket.once('connect', () => done(true, `отвечает за ${Date.now() - started} мс`))
        socket.once('timeout', () => done(false, `нет ответа за ${timeoutMs / 1000} с`))
        socket.once('error', (error) => done(false, error.message))
        socket.connect(port, host)
      }),
  )
}

/**
 * WebSocket ретранслятора для веб-клиента: TLS на порту ретранслятора + 2.
 * Проверяем, что сертификат действителен для имени узла.
 */
function probeTls(address: string, timeoutMs = 4000): Promise<ProbeResult> {
  const separator = address.lastIndexOf(':')
  const host = address.slice(0, separator)
  const port = Number(address.slice(separator + 1)) + 2
  return import('node:tls').then(
    ({ connect }) =>
      new Promise((resolve) => {
        const started = Date.now()
        let settled = false
        const socket = connect({ host, port, servername: host, timeout: timeoutMs })
        const done = (ok: boolean, detail: string) => {
          if (settled) return
          settled = true
          socket.destroy()
          resolve({ ok, ms: Date.now() - started, detail })
        }
        socket.once('secureConnect', () => {
          const validTo = socket.getPeerCertificate()?.valid_to
          const days = validTo ? Math.floor((new Date(validTo).getTime() - Date.now()) / 86_400_000) : NaN
          if (!socket.authorized) done(false, `сертификат не принят: ${socket.authorizationError}`)
          else done(true, Number.isFinite(days) ? `сертификат ещё ${days} дн.` : 'сертификат в порядке')
        })
        socket.once('timeout', () => done(false, `нет ответа за ${timeoutMs / 1000} с`))
        socket.once('error', (error) => done(false, error.message))
      }),
  )
}

export interface RelayStatus extends RelayNode {
  tcp: ProbeResult
  /** Только у дополнительных узлов: у основного TLS отдаёт nginx сайта. */
  tls: ProbeResult | null
}

export async function relayStatuses(): Promise<RelayStatus[]> {
  const nodes = await readNodes()
  return Promise.all(
    nodes.map(async (node) => {
      const isMain = node.id === MAIN_RELAY_ID
      // Основной узел проверяем по внутренней сети: снаружи сервер сам себя
      // может не увидеть.
      const [tcp, tls] = await Promise.all([
        probeTcp(isMain ? config.rustdesk.hbbrCommand : node.address),
        isMain || isIpAddress(node.address) ? Promise.resolve(null) : probeTls(node.address),
      ])
      return { ...publicNode(node), tcp, tls }
    }),
  )
}

/** Адреса, которые должен раздавать hbbs. */
export async function desiredRelayList(): Promise<string[]> {
  return (await readNodes()).filter((node) => node.enabled).map((node) => node.address)
}

/** Что сейчас раздаёт hbbs (только прошедшие его проверку доступности). */
export async function hbbsRelayList(): Promise<string[]> {
  const output = await sendServerCommand('hbbs', 'rs')
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export interface ReconcileState {
  at: string
  ok: boolean
  applied: boolean
  detail: string
}

let lastReconcile: ReconcileState | null = null
let lastReconcileAt = 0
let running: Promise<ReconcileState> | null = null

export const reconcileState = () => lastReconcile

/** Передаёт список ретрансляторов hbbs. */
export async function applyRelays(): Promise<ReconcileState> {
  const list = await desiredRelayList()
  const at = new Date().toISOString()
  try {
    await sendServerCommand('hbbs', `rs ${list.join(',')}`)
    lastReconcile = { at, ok: true, applied: true, detail: `hbbs получил список: ${list.join(', ')}` }
  } catch (error) {
    const detail = error instanceof ServerCmdError ? error.message : String(error)
    lastReconcile = { at, ok: false, applied: false, detail }
  }
  lastReconcileAt = Date.now()
  return lastReconcile
}

/**
 * Сверяет список hbbs с админкой и при расхождении передаёт его заново.
 * hbbs сам убирает из раздачи недоступные узлы — это не расхождение. А вот
 * включённый узел, который отвечает, но которого hbbs не раздаёт, значит,
 * что hbbs перезапустился и забыл список.
 */
export async function reconcileRelays(options: { force?: boolean } = {}): Promise<ReconcileState | null> {
  if (!options.force && Date.now() - lastReconcileAt < RECONCILE_EVERY_MS) return null
  if (running) return running
  lastReconcileAt = Date.now()

  running = (async () => {
    const at = new Date().toISOString()
    try {
      const desired = await desiredRelayList()
      const current = await hbbsRelayList()
      const extra = current.filter((address) => !desired.includes(address))
      const missing = desired.filter((address) => !current.includes(address))

      let needApply = extra.length > 0 || current.length === 0
      if (!needApply && missing.length > 0) {
        const nodes = await readNodes()
        const probes = await Promise.all(
          missing.map((address) => {
            const node = nodes.find((item) => item.address === address)
            return probeTcp(node?.id === MAIN_RELAY_ID ? config.rustdesk.hbbrCommand : address)
          }),
        )
        needApply = probes.some((probe) => probe.ok)
      }
      if (needApply) return await applyRelays()

      const detail = missing.length
        ? `hbbs раздаёт ${current.join(', ')}; не отвечают: ${missing.join(', ')}`
        : `hbbs раздаёт ${current.join(', ')}`
      lastReconcile = { at, ok: true, applied: false, detail }
      return lastReconcile
    } catch (error) {
      const detail = error instanceof ServerCmdError ? error.message : String(error)
      lastReconcile = { at, ok: false, applied: false, detail }
      return lastReconcile
    } finally {
      running = null
    }
  })()
  return running
}
