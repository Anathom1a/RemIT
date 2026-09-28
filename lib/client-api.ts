import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { config } from './config'
import { getStore } from './store'
import { clientIp } from './rate-limit'
import { touchDevice } from './quota'
import type { ClientToken, User } from './types'

/**
 * API клиента RustDesk (вход, адресная книга, сведения об устройствах),
 * которое раньше обслуживала панель rustdesk-api. Форматы ответов повторяют
 * то, что ждёт клиент: ошибки — `{"error": "..."}` с кодом 400, без входа — 401.
 *
 * Токен клиента — JWT HS256 с полями `user_id` и `exp`, подписанный JWT_KEY.
 * Этот же ключ знает hbbs: при MUST_LOGIN=Y он пускает к соединению только
 * клиентов с действующим токеном. Сайт дополнительно хранит хеш каждого
 * токена — так работают выход и отзыв входа из кабинета.
 */

export function clientError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url')

/** hbbs читает user_id как u32: берём стабильное число из id аккаунта. */
function numericUserId(userId: string): number {
  return createHash('sha256').update(userId).digest().readUInt32BE(0) >>> 1
}

function signJwt(payload: Record<string, unknown>, key: string): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const signature = createHmac('sha256', key).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${signature}`
}

function verifyJwt(token: string, key: string, now: number): boolean {
  const [head, body, signature] = token.split('.')
  if (!head || !body || !signature) return false
  const expected = Buffer.from(createHmac('sha256', key).update(`${head}.${body}`).digest('base64url'))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { exp?: number }
    return typeof claims.exp === 'number' && claims.exp > Math.floor(now / 1000)
  } catch {
    return false
  }
}

export interface LoginDevice {
  deviceId: string
  uuid: string
  deviceName: string
  os: string
}

export interface TokenOptions {
  /** share — гостевой токен веб-клиента: одно устройство, без API. */
  scope?: 'full' | 'share'
  peerId?: string
  shareToken?: string
  ttlSeconds?: number
}

/** Выдаёт токен клиенту после входа. */
export async function issueClientToken(
  user: User,
  device: LoginDevice,
  request: Request,
  options: TokenOptions = {},
): Promise<string> {
  const now = Date.now()
  const expiresAt = now + (options.ttlSeconds ?? config.client.tokenTtlSeconds) * 1000
  const token = config.client.jwtKey
    ? signJwt(
        { user_id: numericUserId(user.id), exp: Math.floor(expiresAt / 1000), jti: randomBytes(8).toString('hex') },
        config.client.jwtKey,
      )
    : randomBytes(32).toString('base64url')

  const store = await getStore()
  const record: ClientToken = {
    tokenHash: hashToken(token),
    userId: user.id,
    deviceId: device.deviceId.slice(0, 64),
    uuid: device.uuid.slice(0, 200),
    deviceName: device.deviceName.slice(0, 100),
    os: device.os.slice(0, 100),
    ip: clientIp(request),
    createdAt: new Date(now).toISOString(),
    lastUsedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    revokedAt: null,
    scope: options.scope ?? 'full',
    peerId: options.peerId ?? '',
    shareToken: options.shareToken ?? '',
  }
  await store.createClientToken(record)
  return token
}

export interface ClientAuth {
  user: User
  token: ClientToken
}

/**
 * Проверяет `Authorization: Bearer <токен>`; null — не вошёл или вход отозван.
 * Гостевые токены (scope share) по умолчанию не пускаем: API им не положено.
 */
export async function authenticateClient(
  request: Request,
  options: { allowShare?: boolean } = {},
): Promise<ClientAuth | null> {
  const header = request.headers.get('authorization') ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) return null
  const auth = await clientTokenInfo(header.slice(7).trim())
  if (!auth || (auth.token.scope === 'share' && !options.allowShare)) return null
  return auth
}

/** Токен и его владелец по сырому значению токена. */
export async function clientTokenInfo(raw: string): Promise<ClientAuth | null> {
  if (!raw) return null

  const now = Date.now()
  if (config.client.jwtKey && !verifyJwt(raw, config.client.jwtKey, now)) return null

  const store = await getStore()
  const token = await store.findClientToken(hashToken(raw))
  if (!token || token.revokedAt || new Date(token.expiresAt).getTime() <= now) return null
  const user = await store.findUserById(token.userId)
  if (!user || user.status !== 'active') return null

  // Время последнего обращения пишем не чаще раза в минуту: клиент ходит часто.
  if (now - new Date(token.lastUsedAt).getTime() > 60_000) {
    await store.touchClientToken(token.tokenHash, new Date(now).toISOString())
  }
  return { user, token }
}

/** Аккаунт по обычному (не гостевому) токену входа. */
export async function userByClientToken(raw: string): Promise<User | null> {
  const auth = await clientTokenInfo(raw)
  return auth && auth.token.scope === 'full' ? auth.user : null
}

export async function revokeClientTokenByRaw(request: Request): Promise<void> {
  const auth = await authenticateClient(request)
  if (!auth) return
  const store = await getStore()
  await store.revokeClientToken(auth.token.tokenHash, new Date().toISOString())
}

/** Пользователь в том виде, в каком его показывает клиент. */
export function userPayload(user: User) {
  return {
    name: user.email,
    display_name: user.name || user.email,
    email: user.email,
    note: '',
    is_admin: false,
    status: 1,
    info: {},
  }
}

/** Гость по ссылке веб-клиента: имя владельца не показываем. */
export function guestPayload() {
  return { name: 'Гость', display_name: 'Гость', email: '', note: '', is_admin: false, status: 1, info: {} }
}

/** Тело запроса как JSON; при ошибке — null. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    const text = await request.text()
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

type RouteContext = { params: Promise<Record<string, string>> }

/**
 * Обработчик маршрута API клиента: проверяет вход и превращает ошибки
 * адресной книги в ответ `{"error": ...}`, который клиент покажет человеку.
 */
export function clientRoute(
  handler: (auth: ClientAuth, request: Request, params: Record<string, string>) => Promise<Response>,
  options: { allowShare?: boolean } = {},
) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    const auth = await authenticateClient(request, options)
    if (!auth) return unauthorized()
    try {
      return await handler(auth, request, context?.params ? await context.params : {})
    } catch (error) {
      // Ошибки предметной области (AbError) несут status — это ответ человеку.
      if (error instanceof Error && typeof (error as { status?: unknown }).status === 'number') {
        return clientError(error.message)
      }
      console.error('[client-api]', error)
      return clientError('Внутренняя ошибка сервера', 500)
    }
  }
}

/** Пустой успешный ответ — так отвечала панель на изменения в книге. */
export function emptyOk(): Response {
  return new Response('', { status: 200 })
}

/**
 * Компьютер, с которого вошли, записываем на аккаунт — на нём сразу
 * действует тариф. Уже привязанный к другому аккаунту не трогаем. Вход из
 * браузера устройства не даёт.
 */
export async function bindLoginDevice(request: Request, userId: string, rustdeskId: string, info: Record<string, unknown>) {
  if (!rustdeskId || request.headers.get('referer') || info.type === 'browser') return
  if (!/^[0-9A-Za-z_-]{3,64}$/.test(rustdeskId)) return

  const store = await getStore()
  const patch: { name?: string; os?: string } = {}
  if (typeof info.name === 'string' && info.name) patch.name = info.name.slice(0, 100)
  if (typeof info.os === 'string' && info.os) patch.os = info.os.slice(0, 100)
  const device = await touchDevice(store, rustdeskId, patch)
  if (device && !device.userId) await store.setDeviceOwner(rustdeskId, userId)
}
