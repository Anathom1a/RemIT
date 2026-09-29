// Настоящие hbbs и hbbr для тестов (свои сборки с патчами RemIT).
// Пути к бинарникам — HBBS_BIN и HBBR_BIN; рабочий каталог — HBB_DIR.
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const dir = () => process.env.HBB_DIR ?? path.join(os.tmpdir(), 'remit-hbb')

export const hbbAvailable = () =>
  Boolean(process.env.HBBS_BIN && process.env.HBBR_BIN && fs.existsSync(process.env.HBBS_BIN) && fs.existsSync(process.env.HBBR_BIN))

/** Адрес машины не на loopback: команды с токеном hbbs принимает только по сети. */
export function hostIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list ?? []) if (item.family === 'IPv4' && !item.internal) return item.address
  }
  return '127.0.0.1'
}

export function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect(port, host)
    socket.setTimeout(1000)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
  })
}

export async function waitPort(port, open = true, ms = 10_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await portOpen(port)) === open) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return false
}

function launch(name, bin, args, token) {
  const work = path.join(dir(), name)
  fs.mkdirSync(work, { recursive: true })
  const log = fs.openSync(path.join(work, `${name}.log`), 'a')
  const child = spawn(bin, args, {
    cwd: work,
    env: { ...process.env, REMIT_SERVICE_TOKEN: token },
    detached: true,
    stdio: ['ignore', log, log],
  })
  child.unref()
  fs.writeFileSync(path.join(work, `${name}.pid`), String(child.pid))
  return child
}

function kill(name) {
  const pidFile = path.join(dir(), name, `${name}.pid`)
  if (!fs.existsSync(pidFile)) return
  try {
    process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL')
  } catch {
    // уже остановлен
  }
  fs.rmSync(pidFile, { force: true })
}

/** hbbs: -r — ретранслятор по умолчанию. Ключ сервера создаётся при первом запуске. */
export async function startHbbs({ relay = process.env.HBBS_RELAY ?? '127.0.0.1:21117', token = process.env.HBB_TOKEN ?? '' } = {}) {
  kill('hbbs')
  launch('hbbs', process.env.HBBS_BIN, ['-r', relay, '-k', '_'], token)
  await waitPort(21116)
  await waitPort(21115)
}

export async function stopHbbs() {
  kill('hbbs')
  await waitPort(21116, false)
}

export function publicKey() {
  return fs.readFileSync(path.join(dir(), 'hbbs', 'id_ed25519.pub'), 'utf8').trim()
}

/** hbbr: основной (21117) или отдельный узел (name, port) со своим токеном. */
export async function startHbbr({ name = 'hbbr', port = 21117, token = process.env.HBB_TOKEN ?? '' } = {}) {
  kill(name)
  launch(name, process.env.HBBR_BIN, ['-p', String(port), '-k', publicKey()], token)
  await waitPort(port)
}

export async function stopHbbr(name = 'hbbr', port = 21117) {
  kill(name)
  await waitPort(port, false)
}
