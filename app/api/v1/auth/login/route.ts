import { NextResponse } from 'next/server'
import { createUserSession, hashPassword, normalizeEmail, sessionCookieOptions, verifyPassword } from '@/lib/auth'
import { checkLimit, clearLimit, clientIp, loginEmailKey, recordHit, tooManyAttempts } from '@/lib/rate-limit'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Защита от перебора паролей. Считаем только неудачные попытки:
 * - на почту — 5 за 15 минут: так не подобрать пароль к конкретному аккаунту;
 * - на адрес — 30 за 15 минут: так не перебирать много аккаунтов с одного
 *   адреса. Порог выше, чтобы не мешать офису за одним NAT.
 */
const WINDOW_MS = 15 * 60 * 1000
const PER_EMAIL = 5
const PER_IP = 30

// Хеш-пустышка: для несуществующей почты проверяем пароль против него, чтобы
// время ответа не выдавало, есть ли такой аккаунт.
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  return dummyHash
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const email = normalizeEmail(String(payload.email ?? ''))
  const password = String(payload.password ?? '')

  const emailKey = loginEmailKey(email)
  const ipKey = `login-ip:${clientIp(request)}`
  for (const [key, limit] of [
    [emailKey, PER_EMAIL],
    [ipKey, PER_IP],
  ] as const) {
    const check = checkLimit(key, limit, WINDOW_MS)
    if (!check.allowed) {
      const { body, headers } = tooManyAttempts(check.retryAfter)
      return NextResponse.json(body, { status: 429, headers })
    }
  }

  const store = await getStore()
  const user = await store.findUserByEmail(email)
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()))

  // Одинаковый ответ на «нет пользователя» и «неверный пароль» — не подсказываем перебором.
  if (!user || !valid) {
    recordHit(emailKey, WINDOW_MS)
    recordHit(ipKey, WINDOW_MS)
    return NextResponse.json({ error: 'Неверная почта или пароль' }, { status: 401 })
  }

  clearLimit(emailKey)
  const token = await createUserSession(user.id)
  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name })
  response.cookies.set({ ...sessionCookieOptions(), value: token })
  return response
}
