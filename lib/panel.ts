import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { config } from './config'
import { getStore } from './store'
import type { PanelAccount, User } from './types'

/**
 * Единый аккаунт сайта и панели lejianwen/rustdesk-api.
 *
 * Вход в клиенте (`/api/login`) принимает сайт. Если это почта аккаунта сайта
 * и пароль верный, сайт при первом входе заводит пользователя в панели
 * через её админский API и дальше входит в панель от его имени. Пароль в
 * панели случайный и хранится зашифрованным: человек знает только пароль от
 * сайта, и смена или сброс пароля на сайте сразу действуют и в клиенте.
 *
 * Адресная книга, группы и токены клиента по-прежнему живут в панели — сайт
 * их не трогает.
 */

export class PanelError extends Error {}

const TIMEOUT_MS = 8000
/** Прежние аккаунты помечаем так, чтобы узнать своих после сбоя на полпути. */
const REMARK_PREFIX = 'remit:'

export function panelLinkEnabled(): boolean {
  return Boolean(config.panel.adminUser && config.panel.adminPassword)
}

function panelUrl(path: string): string {
  return `${config.rustdesk.upstream.replace(/\/$/, '')}${path}`
}

// --- Шифрование пароля в панели -------------------------------------------

function secretKey(): Buffer {
  return createHash('sha256').update(`remit-panel:${config.auth.secret}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

/** null — секрет не расшифровать: например, сменили REMIT_AUTH_SECRET. */
export function decryptSecret(secret: string): string | null {
  const [version, iv, tag, data] = secret.split('.')
  if (version !== 'v1' || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** 24 символа: панель принимает пароли от 4 до 32 символов. */
function newPanelPassword(): string {
  return randomBytes(18).toString('base64url')
}

// --- Админский API панели -------------------------------------------------

interface PanelUser {
  id: number
  username: string
  email: string
  nickname: string
  remark: string
  is_admin: boolean | null
  status: number
}

let adminToken: string | null = null
let adminLogin: Promise<string> | null = null

async function loginAdmin(): Promise<string> {
  const response = await fetch(panelUrl('/api/admin/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: config.panel.adminUser,
      password: config.panel.adminPassword,
      platform: 'remit-site',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const body = (await response.json().catch(() => null)) as { code?: number; message?: string; data?: any } | null
  if (!body || body.code !== 0 || !body.data?.token) {
    // code 110 — панель просит капчу после неудачных входов с адреса сайта.
    throw new PanelError(`вход администратора в панель не удался: ${body?.message ?? response.status}`)
  }
  return String(body.data.token)
}

async function getAdminToken(): Promise<string> {
  if (adminToken) return adminToken
  adminLogin ??= loginAdmin().finally(() => {
    adminLogin = null
  })
  adminToken = await adminLogin
  return adminToken
}

async function adminRequest<T = any>(method: 'GET' | 'POST', path: string, body?: unknown, retry = true): Promise<T> {
  const token = await getAdminToken()
  const response = await fetch(panelUrl(`/api/admin${path}`), {
    method,
    headers: { 'api-token': token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const json = (await response.json().catch(() => null)) as { code?: number; message?: string; data?: T } | null
  // 403 в теле или 401 — токен истёк или его отозвали: входим заново один раз.
  if (retry && (response.status === 401 || json?.code === 403)) {
    adminToken = null
    return adminRequest(method, path, body, false)
  }
  if (!json || json.code !== 0) {
    throw new PanelError(`панель: ${path}: ${json?.message ?? `HTTP ${response.status}`}`)
  }
  return json.data as T
}

export async function findPanelUser(username: string): Promise<PanelUser | null> {
  const wanted = username.toLowerCase()
  // Панель ищет по вхождению подстроки: у короткого логина совпадений может
  // быть больше страницы, поэтому листаем.
  const pageSize = 100
  for (let page = 1; page <= 50; page++) {
    const data = await adminRequest<{ list?: PanelUser[] }>(
      'GET',
      `/user/list?page=${page}&page_size=${pageSize}&username=${encodeURIComponent(wanted)}`,
    )
    const list = data?.list ?? []
    const found = list.find((user) => user.username.toLowerCase() === wanted)
    if (found) return found
    if (list.length < pageSize) break
  }
  return null
}

let groupChecked = false

/** Не заводим людей в общую группу: там все видят устройства друг друга. */
async function ensurePrivateGroup(): Promise<void> {
  if (groupChecked) return
  const group = await adminRequest<{ id: number; type: number }>('GET', `/group/detail/${config.panel.groupId}`)
  if (group?.type !== 1) {
    throw new PanelError(`группа ${config.panel.groupId} в панели не обычная (type=${group?.type}); задайте REMIT_PANEL_GROUP_ID`)
  }
  groupChecked = true
}

async function createPanelUser(user: User, username: string): Promise<PanelUser> {
  await ensurePrivateGroup()
  await adminRequest('POST', '/user/create', {
    username,
    email: user.email,
    nickname: user.name || user.email,
    group_id: config.panel.groupId,
    is_admin: false,
    status: 1,
    remark: `${REMARK_PREFIX}${user.id}`,
  })
  const created = await findPanelUser(username)
  if (!created) throw new PanelError(`панель не вернула созданного пользователя ${username}`)
  return created
}

/** Меняет пароль в панели. Панель при этом выходит из клиента на всех устройствах. */
async function setPanelPassword(panelUserId: number, password: string): Promise<void> {
  await adminRequest('POST', '/user/changePwd', { id: panelUserId, password })
}

// --- Связь аккаунтов --------------------------------------------------------

export interface PanelCredentials {
  account: PanelAccount
  password: string
}

// Один вход на аккаунт за раз: два первых входа подряд не должны завести
// двух пользователей или перебить друг другу пароль.
const locks = new Map<string, Promise<unknown>>()

function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(task)
  const tail = next.catch(() => undefined)
  locks.set(key, tail)
  tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key)
  })
  return next
}

/** Логины для панели: почта, если влезает в 32 символа, иначе id аккаунта. */
function usernameCandidates(user: User): string[] {
  const candidates: string[] = []
  const email = user.email.toLowerCase()
  if (email.length >= 2 && email.length <= 32 && !/\s/.test(email)) candidates.push(email)
  candidates.push(user.id.toLowerCase())
  return candidates
}

async function provision(user: User): Promise<PanelCredentials> {
  const store = await getStore()
  for (const username of usernameCandidates(user)) {
    let panelUser = await findPanelUser(username)
    if (panelUser && panelUser.remark !== `${REMARK_PREFIX}${user.id}`) {
      // Логин занят чужим аккаунтом панели. Забирать его без пароля нельзя:
      // почту на сайте никто не подтверждал. Перенести прежний аккаунт
      // человек может сам в кабинете, введя его пароль.
      continue
    }
    panelUser ??= await createPanelUser(user, username)
    if (await store.findPanelAccountByPanelUserId(panelUser.id)) continue

    const password = newPanelPassword()
    await setPanelPassword(panelUser.id, password)
    const now = new Date().toISOString()
    const account: PanelAccount = {
      userId: user.id,
      panelUserId: panelUser.id,
      panelUsername: panelUser.username.toLowerCase(),
      secret: encryptSecret(password),
      origin: 'created',
      createdAt: now,
      updatedAt: now,
    }
    await store.savePanelAccount(account)
    return { account, password }
  }
  throw new PanelError(`не нашлось свободного логина в панели для ${user.id}`)
}

async function rotate(account: PanelAccount): Promise<PanelCredentials> {
  const store = await getStore()
  const password = newPanelPassword()
  await setPanelPassword(account.panelUserId, password)
  const updated: PanelAccount = { ...account, secret: encryptSecret(password), updatedAt: new Date().toISOString() }
  await store.savePanelAccount(updated)
  return { account: updated, password }
}

/** Данные для входа в панель от имени пользователя; при первом входе заводит его там. */
export function ensurePanelAccount(user: User): Promise<PanelCredentials> {
  return withLock(user.id, async () => {
    const store = await getStore()
    const account = await store.findPanelAccount(user.id)
    if (!account) return provision(user)
    const password = decryptSecret(account.secret)
    return password ? { account, password } : rotate(account)
  })
}

/**
 * Новый пароль в панели. Панель при этом завершает все входы в клиенте —
 * так сброс пароля на сайте выкидывает и из клиента. Без связи — ничего.
 */
export function rotatePanelPassword(userId: string): Promise<PanelCredentials | null> {
  return withLock(userId, async () => {
    const store = await getStore()
    const account = await store.findPanelAccount(userId)
    return account ? rotate(account) : null
  })
}

export class LinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * Перенос прежнего аккаунта клиента: человек доказывает, что аккаунт его,
 * вводя логин и пароль от панели. После переноса в клиенте входят почтой и
 * паролем сайта, адресная книга остаётся та же.
 */
export function linkExistingPanelAccount(
  user: User,
  login: string,
  password: string,
  forwardHeaders: Headers,
): Promise<PanelAccount> {
  return withLock(user.id, async () => {
    const store = await getStore()
    const headers = new Headers({ 'content-type': 'application/json' })
    for (const name of ['x-real-ip', 'x-forwarded-for', 'user-agent', 'accept-language']) {
      const value = forwardHeaders.get(name)
      if (value) headers.set(name, value)
    }
    // Проверяем пароль обычным входом клиента: так работает и защита панели
    // от перебора по адресу человека, а не по адресу сайта.
    const response = await fetch(panelUrl('/api/login'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username: login,
        password,
        id: '',
        uuid: '',
        autoLogin: false,
        type: 'account',
        deviceInfo: { name: 'remit.su', os: 'web', type: 'webadmin' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null)
    if (!response) throw new LinkError('Сервис входа временно недоступен. Попробуйте позже.', 502)
    const body = (await response.json().catch(() => null)) as {
      access_token?: string
      error?: string
      user?: { name?: string; is_admin?: boolean }
    } | null
    if (!response.ok || !body?.access_token || !body.user?.name) {
      throw new LinkError('Неверный логин или пароль от клиента', 400)
    }
    if (body.user.is_admin || body.user.name.toLowerCase() === config.panel.adminUser.toLowerCase()) {
      throw new LinkError('Аккаунт администратора панели перенести нельзя', 400)
    }

    const panelUser = await findPanelUser(body.user.name)
    if (!panelUser) throw new LinkError('Аккаунт клиента не найден', 404)
    const owner = await store.findPanelAccountByPanelUserId(panelUser.id)
    if (owner && owner.userId !== user.id) {
      throw new LinkError('Этот аккаунт клиента уже перенесён в другой аккаунт RemIT', 409)
    }

    // Новый пароль в панели завершает прежние входы в клиенте: дальше
    // человек входит почтой и паролем сайта.
    const newPassword = newPanelPassword()
    await setPanelPassword(panelUser.id, newPassword)
    const now = new Date().toISOString()
    const previous = await store.findPanelAccount(user.id)
    const account: PanelAccount = {
      userId: user.id,
      panelUserId: panelUser.id,
      panelUsername: panelUser.username.toLowerCase(),
      secret: encryptSecret(newPassword),
      origin: 'linked',
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    }
    await store.savePanelAccount(account)
    return account
  })
}
