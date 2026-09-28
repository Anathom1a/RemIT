import { NextResponse, after } from 'next/server'
import { isValidEmail, normalizeEmail } from '@/lib/auth'
import { requestPasswordReset } from '@/lib/password-reset'
import { clientIp, consumeLimit, tooManyAttempts } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 15 * 60 * 1000

/**
 * Запрос письма со ссылкой для сброса пароля.
 *
 * Ответ всегда одинаковый и приходит сразу: поиск аккаунта и отправка письма
 * идут уже после ответа. Иначе по тексту или по времени ответа можно было бы
 * узнать, зарегистрирована ли почта.
 */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const email = normalizeEmail(String(payload.email ?? ''))

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Укажите корректный адрес электронной почты' }, { status: 400 })
  }

  for (const [key, limit] of [
    [`reset-ip:${clientIp(request)}`, 10],
    [`reset-email:${email}`, 5],
  ] as const) {
    const check = consumeLimit(key, limit, WINDOW_MS)
    if (!check.allowed) {
      const { body, headers } = tooManyAttempts(check.retryAfter)
      return NextResponse.json(body, { status: 429, headers })
    }
  }

  after(async () => {
    try {
      await requestPasswordReset(email)
    } catch (error) {
      console.error('[reset] не удалось обработать запрос сброса пароля:', error)
    }
  })

  return NextResponse.json({ ok: true })
}
