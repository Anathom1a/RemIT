import { hashPassword, normalizeEmail, verifyPassword } from './auth'
import { checkLimit, clearLimit, clientIp, loginEmailKey, recordHit, tooManyAttempts } from './rate-limit'
import { getStore } from './store'
import type { User } from './types'

/**
 * Проверка пароля с защитой от перебора. Общая для входа на сайте и входа в
 * клиенте: аккаунт один, значит и счётчик неудачных попыток один.
 *
 * Считаем только неудачные попытки:
 * - на почту — 5 за 15 минут: так не подобрать пароль к конкретному аккаунту;
 * - на адрес — 30 за 15 минут: так не перебирать много аккаунтов с одного
 *   адреса. Порог выше, чтобы не мешать офису за одним NAT.
 */
const WINDOW_MS = 15 * 60 * 1000
const PER_EMAIL = 5
const PER_IP = 30

function keys(request: Request, email: string): [string, number][] {
  return [
    [loginEmailKey(normalizeEmail(email)), PER_EMAIL],
    [`login-ip:${clientIp(request)}`, PER_IP],
  ]
}

/** Ответ 429, если попыток уже слишком много; иначе null. */
export function loginBlocked(
  request: Request,
  email: string,
): { body: { error: string }; headers: Record<string, string> } | null {
  for (const [key, limit] of keys(request, email)) {
    const check = checkLimit(key, limit, WINDOW_MS)
    if (!check.allowed) return tooManyAttempts(check.retryAfter)
  }
  return null
}

export function recordLoginFailure(request: Request, email: string): void {
  for (const [key] of keys(request, email)) recordHit(key, WINDOW_MS)
}

/** После удачного входа счётчик почты обнуляем; счётчик адреса — нет. */
export function clearLoginFailures(email: string): void {
  clearLimit(loginEmailKey(normalizeEmail(email)))
}

// Хеш-пустышка: для несуществующей почты проверяем пароль против него, чтобы
// время ответа не выдавало, есть ли такой аккаунт.
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  return dummyHash
}

/**
 * Пользователь, если почта и пароль верные; иначе null. Время ответа одинаковое.
 * blocked — пароль верный, но аккаунт заблокирован: об этом говорим только
 * тому, кто знает пароль.
 */
export async function checkCredentials(
  email: string,
  password: string,
): Promise<{ user: User | null; valid: boolean; blocked: boolean }> {
  const store = await getStore()
  const found = await store.findUserByEmail(normalizeEmail(email))
  const user = found && found.status !== 'deleted' ? found : null
  const valid = await verifyPassword(password, user?.passwordHash || (await getDummyHash()))
  const ok = Boolean(user) && valid
  return { user, valid: ok && user!.status === 'active', blocked: ok && user!.status === 'blocked' }
}
