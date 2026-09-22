import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { config } from './config'
import { getStore } from './store'
import type { User } from './types'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

/** scrypt с солью — без внешних зависимостей и без «голого» sha256 для паролей. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scryptAsync(password, salt, 64)
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const derived = await scryptAsync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(expected, derived)
}

function hashToken(token: string): string {
  return createHash('sha256').update(`${token}${config.auth.secret}`).digest('hex')
}

/** Создаёт cookie-сессию кабинета и возвращает значение cookie. */
export async function createUserSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const store = await getStore()
  const now = new Date()
  await store.createAuthSession({
    tokenHash: hashToken(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.auth.sessionTtlSeconds * 1000).toISOString(),
  })
  return token
}

export async function destroyUserSession(token: string): Promise<void> {
  const store = await getStore()
  await store.deleteAuthSession(hashToken(token))
}

/** Текущий пользователь кабинета или null. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies()
  const token = jar.get(config.auth.cookieName)?.value
  if (!token) return null
  const store = await getStore()
  const session = await store.findAuthSession(hashToken(token))
  if (!session) return null
  return store.findUserById(session.userId)
}

export function sessionCookieOptions() {
  return {
    name: config.auth.cookieName,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.auth.cookieSecure,
    path: '/',
    maxAge: config.auth.sessionTtlSeconds,
  }
}

/**
 * Проверка сервисного токена: им подписываются запросы от hbbs и от шлюза
 * heartbeat. Токен задаётся переменной REMIT_SERVICE_TOKEN.
 */
export function isServiceRequest(request: Request): boolean {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const provided = token || request.headers.get('x-remit-token') || ''
  if (!provided || !config.serviceToken) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(config.serviceToken)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}
