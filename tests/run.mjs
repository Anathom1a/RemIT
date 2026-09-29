#!/usr/bin/env node
// Сквозные тесты сайта: каждый набор получает свежий сайт, чистое хранилище и
// заглушки внешних сервисов (ЮKassa, VK ID, Telegram, почта).
//
//   npm run build                  # тесты идут против собранного сайта
//   node tests/run.mjs             # все наборы, хранилище — JSON-файл
//   node tests/run.mjs --pg        # то же на Postgres (TEST_DATABASE_URL)
//   node tests/run.mjs autopay     # один набор
//
// Наборам с настоящими hbbs/hbbr нужны HBBS_BIN и HBBR_BIN (сборка с патчами
// RemIT, см. .github/workflows/ci.yml); без них такие наборы пропускаются.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { hbbAvailable, hostIp, startHbbr, startHbbs, stopHbbr, stopHbbs } from './lib/hbb.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')
const args = process.argv.slice(2)
const PG = args.includes('--pg')
const selected = args.filter((arg) => !arg.startsWith('--'))
const HOST = hostIp()
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'remit-tests-'))
process.env.HBB_DIR = path.join(WORK, 'hbb')

const PORTS = { site: 3300, vk: 21991, yookassa: 21992, telegram: 21993, smtp: 2526 }
const SITE = `http://127.0.0.1:${PORTS.site}`

const BASE_ENV = {
  REMIT_COOKIE_SECURE: 'false',
  REMIT_ADMIN_EMAILS: 'admin@remit.su',
  REMIT_BILLING_PROVIDER: 'manual',
  REMIT_AUTH_SECRET: 'test-auth-secret',
  REMIT_SCHEDULER: 'false',
  // Подтверждение почты проверяет свой набор; остальным оно не мешает.
  REMIT_EMAIL_VERIFICATION: 'optional',
  // Ничего не должно ходить в настоящие сервисы.
  REMIT_HBBS_INTERNAL: '127.0.0.1:1',
  REMIT_HBBS_CMD: '127.0.0.1:1',
  REMIT_HBBR_CMD: '127.0.0.1:1',
  REMIT_TELEGRAM_API_URL: `http://127.0.0.1:${PORTS.telegram}`,
}
const SMTP_ENV = { REMIT_SMTP_HOST: '127.0.0.1', REMIT_SMTP_PORT: String(PORTS.smtp), REMIT_SMTP_SECURE: 'false' }
const HBB_CMD_ENV = (token) => ({
  REMIT_SERVICE_TOKEN: token,
  REMIT_HBBS_INTERNAL: `${HOST}:21116`,
  REMIT_HBBS_CMD: `${HOST}:21115`,
  REMIT_HBBR_CMD: `${HOST}:21117`,
})

/**
 * Наборы. needs: yookassa, vk, telegram, smtp, hbb. hbb — как запустить hbbs
 * (-r и токен команд). env — окружение сайта.
 */
const SUITES = {
  clientapi: { env: { JWT_KEY: 'test-jwt-key', ...HBB_CMD_ENV('secret-tok'), REMIT_RELAY_SERVER: '127.0.0.1:21117' } },
  features: {
    needs: ['vk', 'hbb'],
    hbb: { relay: '127.0.0.1:21117', token: 'secret-tok' },
    env: {
      JWT_KEY: 'test-jwt-key',
      ...HBB_CMD_ENV('secret-tok'),
      REMIT_RELAY_SERVER: '127.0.0.1:21117',
      REMIT_VK_CLIENT_ID: 'vk-app-1',
      REMIT_VK_BASE_URL: `http://127.0.0.1:${PORTS.vk}`,
      REMIT_VK_REDIRECT_URI: `${SITE}/api/v1/auth/vk/callback`,
    },
  },
  'limit-upgrade': { env: { REMIT_SERVICE_TOKEN: 'dev-service-token' } },
  'email-verify': {
    needs: ['smtp', 'vk'],
    env: {
      ...SMTP_ENV,
      REMIT_EMAIL_VERIFICATION: 'required',
      REMIT_API_SERVER: SITE,
      REMIT_VK_CLIENT_ID: 'vk-app-1',
      REMIT_VK_BASE_URL: `http://127.0.0.1:${PORTS.vk}`,
      REMIT_VK_REDIRECT_URI: `${SITE}/api/v1/auth/vk/callback`,
    },
  },
  // Метрика нужна, чтобы проверить: на странице сброса пароля счётчик не стартует.
  'auth-history': { needs: ['smtp'], env: { ...SMTP_ENV, REMIT_YANDEX_METRIKA_ID: '12345678' } },
  attachments: { env: { REMIT_ATTACHMENTS_DIR: path.join(WORK, 'attachments') } },
  autopay: {
    needs: ['yookassa', 'smtp'],
    env: {
      ...SMTP_ENV,
      REMIT_SERVICE_TOKEN: 'svc-pay',
      REMIT_BILLING_PROVIDER: 'yookassa',
      YOOKASSA_SHOP_ID: 'shop1',
      YOOKASSA_SECRET_KEY: 'sk_test',
      YOOKASSA_API_URL: `http://127.0.0.1:${PORTS.yookassa}/v3`,
      YOOKASSA_AUTOPAY: 'true',
      YOOKASSA_VAT_CODE: '11',
      YOOKASSA_TAX_SYSTEM_CODE: '2',
      YOOKASSA_RETURN_URL: `${SITE}/kabinet/podpiska`,
    },
  },
  refunds: {
    needs: ['yookassa', 'smtp'],
    env: {
      ...SMTP_ENV,
      REMIT_SERVICE_TOKEN: 'svc-pay',
      REMIT_BILLING_PROVIDER: 'yookassa',
      YOOKASSA_SHOP_ID: 'shop1',
      YOOKASSA_SECRET_KEY: 'sk_test',
      YOOKASSA_API_URL: `http://127.0.0.1:${PORTS.yookassa}/v3`,
      YOOKASSA_VAT_CODE: '11',
      YOOKASSA_RETURN_URL: `${SITE}/kabinet/podpiska`,
    },
  },
  invoices: {
    needs: ['yookassa', 'smtp'],
    env: {
      ...SMTP_ENV,
      REMIT_SERVICE_TOKEN: 'svc-inv',
      REMIT_API_SERVER: SITE,
      REMIT_BILLING_PROVIDER: 'yookassa',
      YOOKASSA_SHOP_ID: 'shop1',
      YOOKASSA_SECRET_KEY: 'sk_test',
      YOOKASSA_API_URL: `http://127.0.0.1:${PORTS.yookassa}/v3`,
      YOOKASSA_RETURN_URL: `${SITE}/kabinet/podpiska`,
      REMIT_LEGAL_NAME: 'ООО «Ремит»',
      REMIT_LEGAL_INN: '7736207543',
      REMIT_LEGAL_KPP: '773601001',
      REMIT_LEGAL_OGRN: '1027739850962',
      REMIT_LEGAL_ADDRESS: '119021, г. Москва, ул. Льва Толстого, д. 16',
      REMIT_LEGAL_BANK_NAME: 'АО «Тестбанк»',
      REMIT_LEGAL_BIK: '044525999',
      REMIT_LEGAL_ACCOUNT: '40702810900000000001',
      REMIT_LEGAL_CORR_ACCOUNT: '30101810400000000999',
      REMIT_LEGAL_SIGNER: 'Иванов И. И.',
      REMIT_LEGAL_SIGNER_TITLE: 'Генеральный директор',
    },
  },
  promo: {
    needs: ['yookassa'],
    env: {
      REMIT_SERVICE_TOKEN: 'svc-promo',
      REMIT_BILLING_PROVIDER: 'yookassa',
      YOOKASSA_SHOP_ID: 'shop1',
      YOOKASSA_SECRET_KEY: 'sk_test',
      YOOKASSA_API_URL: `http://127.0.0.1:${PORTS.yookassa}/v3`,
      YOOKASSA_AUTOPAY: 'true',
      YOOKASSA_RETURN_URL: `${SITE}/kabinet/podpiska`,
      REMIT_LEGAL_NAME: 'ООО «Ремит»',
      REMIT_LEGAL_INN: '7736207543',
      REMIT_LEGAL_ADDRESS: '119021, г. Москва, ул. Льва Толстого, д. 16',
      REMIT_LEGAL_BANK_NAME: 'АО «Тестбанк»',
      REMIT_LEGAL_BIK: '044525999',
      REMIT_LEGAL_ACCOUNT: '40702810900000000001',
      REMIT_LEGAL_CORR_ACCOUNT: '30101810400000000999',
    },
  },
  seats: { env: { REMIT_SERVICE_TOKEN: 'svc-seats' } },
  reminders: { needs: ['smtp'], env: { ...SMTP_ENV, REMIT_SERVICE_TOKEN: 'svc-rem', REMIT_API_SERVER: SITE } },
  relays: {
    needs: ['hbb'],
    hbb: {
      relay: `${HOST}:21117`,
      token: 'svc-token-123',
      // 5.0.0.0/24 — Москва, 6.0.0.0/24 — Владивосток.
      geo: ['83886080,83886335,55.8,37.6', '100663296,100663551,43.1,131.9'],
    },
    env: { ...HBB_CMD_ENV('svc-token-123'), REMIT_RELAY_SERVER: `${HOST}:21117` },
    publicKey: true,
  },
  monitoring: {
    needs: ['hbb', 'telegram', 'smtp'],
    hbb: { relay: '127.0.0.1:21117', token: 'svc-mon' },
    env: {
      ...SMTP_ENV,
      REMIT_SERVICE_TOKEN: 'svc-mon',
      REMIT_SCHEDULER: 'true',
      REMIT_MONITOR_INTERVAL: '10',
      REMIT_DOMAIN: 'nosuch.invalid',
      REMIT_HBBS_INTERNAL: '127.0.0.1:21116',
      REMIT_HBBS_WS: '127.0.0.1:21118',
      REMIT_HBBR_WS: '127.0.0.1:21119',
      REMIT_HBBR_CMD: '127.0.0.1:21117',
      REMIT_HBBS_CMD: '127.0.0.1:21115',
      REMIT_RELAY_SERVER: '127.0.0.1:21117',
      REMIT_TELEGRAM_BOT_TOKEN: 'bot1',
      REMIT_TELEGRAM_CHAT_ID: '555',
      REMIT_ALERT_TELEGRAM_CHAT_ID: '777',
    },
  },
}

const children = []
function start(name, command, commandArgs, env, logFile) {
  const log = fs.openSync(logFile, 'a')
  const child = spawn(command, commandArgs, { env: { ...process.env, ...env }, stdio: ['ignore', log, log] })
  child.name = name
  children.push(child)
  return child
}
function stopAll() {
  for (const child of children.splice(0)) {
    try {
      child.kill('SIGKILL')
    } catch {
      // уже остановлен
    }
  }
}
process.on('exit', stopAll)
process.on('SIGINT', () => process.exit(130))

async function waitHttp(url, ms = 30_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return true
    } catch {
      // ещё не поднялся
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

async function freshDatabase(name) {
  const admin = process.env.TEST_DATABASE_URL
  if (!admin) throw new Error('Для --pg нужен TEST_DATABASE_URL (подключение к Postgres с правом создавать базы)')
  const { Pool } = (await import('pg')).default
  const pool = new Pool({ connectionString: admin, max: 1 })
  const db = `remit_test_${name.replace(/\W/g, '_')}`
  await pool.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`)
  await pool.query(`CREATE DATABASE ${db}`)
  await pool.end()
  const url = new URL(admin)
  url.pathname = `/${db}`
  return url.toString()
}

function prepareStandalone() {
  if (!fs.existsSync(path.join(STANDALONE, 'server.js'))) {
    throw new Error('Нет .next/standalone — сначала npm run build')
  }
  // Статика и public не входят в standalone: кладём рядом, как в Dockerfile.
  fs.cpSync(path.join(ROOT, '.next', 'static'), path.join(STANDALONE, '.next', 'static'), { recursive: true })
  fs.cpSync(path.join(ROOT, 'public'), path.join(STANDALONE, 'public'), { recursive: true })
}

async function runSuite(name, suite) {
  const dir = path.join(WORK, name)
  fs.mkdirSync(dir, { recursive: true })
  const needs = new Set(suite.needs ?? [])
  if (needs.has('hbb') && !hbbAvailable()) return { name, status: 'skip', note: 'нет HBBS_BIN/HBBR_BIN' }

  const mailDir = path.join(dir, 'mail')
  const storeFile = path.join(dir, 'store.json')
  const databaseUrl = PG ? await freshDatabase(name) : ''
  const fakes = path.join(ROOT, 'tests', 'fakes')
  if (needs.has('vk')) start('vk', 'node', [path.join(fakes, 'vk.mjs')], { PORT: String(PORTS.vk) }, path.join(dir, 'vk.log'))
  if (needs.has('yookassa')) start('yookassa', 'node', [path.join(fakes, 'yookassa.mjs')], { PORT: String(PORTS.yookassa) }, path.join(dir, 'yookassa.log'))
  if (needs.has('telegram')) start('telegram', 'node', [path.join(fakes, 'telegram.mjs')], { PORT: String(PORTS.telegram) }, path.join(dir, 'telegram.log'))
  if (needs.has('smtp')) start('smtp', 'node', [path.join(fakes, 'smtp-sink.mjs')], { PORT: String(PORTS.smtp), MAIL_DIR: mailDir }, path.join(dir, 'smtp.log'))

  const hbbEnv = {}
  if (suite.hbb) {
    process.env.HBB_TOKEN = suite.hbb.token
    process.env.HBBS_RELAY = suite.hbb.relay
    // База GeoIP для hbbs (патч relay-geo-hook): geo.csv в его рабочем каталоге.
    const hbbsDir = path.join(process.env.HBB_DIR, 'hbbs')
    fs.mkdirSync(hbbsDir, { recursive: true })
    fs.writeFileSync(path.join(hbbsDir, 'geo.csv'), (suite.hbb.geo ?? []).join('\n') + '\n')
    await startHbbs(suite.hbb)
    await startHbbr({ token: suite.hbb.token })
    Object.assign(hbbEnv, { HBB_TOKEN: suite.hbb.token, HBBS_RELAY: suite.hbb.relay })
  }
  const publicKey = suite.publicKey ? fs.readFileSync(path.join(process.env.HBB_DIR, 'hbbs', 'id_ed25519.pub'), 'utf8').trim() : ''

  const siteLog = path.join(dir, 'site.log')
  start(
    'site',
    'node',
    [path.join(STANDALONE, 'server.js')],
    {
      ...BASE_ENV,
      ...suite.env,
      ...(publicKey ? { REMIT_PUBLIC_KEY: publicKey } : {}),
      PORT: String(PORTS.site),
      HOSTNAME: '127.0.0.1',
      DATABASE_URL: databaseUrl,
      REMIT_STORE_FILE: storeFile,
      REMIT_RELEASES_DIR: path.join(dir, 'releases'),
      REMIT_ATTACHMENTS_DIR: suite.env?.REMIT_ATTACHMENTS_DIR ?? path.join(dir, 'attachments'),
    },
    siteLog,
  )
  if (!(await waitHttp(`${SITE}/api/health`))) return { name, status: 'fail', note: 'сайт не поднялся', log: siteLog }
  await Promise.all([PORTS.vk, PORTS.yookassa, PORTS.telegram].map((port) => waitHttp(`http://127.0.0.1:${port}/__log`, 3000)))

  const started = Date.now()
  const output = []
  const code = await new Promise((resolve) => {
    const child = spawn('node', [path.join(ROOT, 'tests', 'suites', `${name}.mjs`)], {
      env: {
        ...process.env,
        ...hbbEnv,
        BASE: SITE,
        STORE_FILE: storeFile,
        DATABASE_URL: databaseUrl,
        MAIL_DIR: mailDir,
        HOST_IP: HOST,
        PUBLIC_KEY: publicKey,
        YOOKASSA_URL: `http://127.0.0.1:${PORTS.yookassa}`,
        VK_URL: `http://127.0.0.1:${PORTS.vk}`,
        TELEGRAM_URL: `http://127.0.0.1:${PORTS.telegram}`,
        REPO_ROOT: ROOT,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), 12 * 60_000)
    child.stdout.on('data', (chunk) => output.push(chunk))
    child.stderr.on('data', (chunk) => output.push(chunk))
    child.on('close', (exit) => {
      clearTimeout(timer)
      resolve(exit ?? 1)
    })
  })
  stopAll()
  if (suite.hbb) {
    await stopHbbs()
    await stopHbbr()
  }
  const text = Buffer.concat(output).toString('utf8')
  fs.writeFileSync(path.join(dir, 'output.txt'), text)
  const summary = text.trim().split('\n').at(-1) ?? ''
  return { name, status: code === 0 ? 'ok' : 'fail', note: summary, seconds: Math.round((Date.now() - started) / 1000), text, log: siteLog }
}

const names = selected.length ? selected : Object.keys(SUITES)
for (const name of names) if (!SUITES[name]) throw new Error(`Нет набора ${name}. Есть: ${Object.keys(SUITES).join(', ')}`)
prepareStandalone()
console.log(`Хранилище: ${PG ? 'Postgres' : 'JSON-файл'}; hbbs/hbbr: ${hbbAvailable() ? 'есть' : 'нет'}; рабочий каталог ${WORK}`)

const results = []
for (const name of names) {
  process.stdout.write(`▶ ${name} … `)
  const result = await runSuite(name, SUITES[name])
  results.push(result)
  const mark = result.status === 'ok' ? '✓' : result.status === 'skip' ? '–' : '✗'
  console.log(`${mark} ${result.note ?? ''}${result.seconds ? ` (${result.seconds} с)` : ''}`)
  if (result.status === 'fail') {
    if (result.text) console.log(result.text.split('\n').filter((line) => line.trim()).slice(-40).join('\n'))
    if (result.log && fs.existsSync(result.log)) {
      console.log('--- журнал сайта ---')
      console.log(fs.readFileSync(result.log, 'utf8').split('\n').slice(-30).join('\n'))
    }
  }
}
const failed = results.filter((result) => result.status === 'fail')
const skipped = results.filter((result) => result.status === 'skip')
console.log(`\nИтог: ${results.length - failed.length - skipped.length} прошли, ${failed.length} упали, ${skipped.length} пропущены`)
process.exit(failed.length ? 1 : 0)
