import { NextResponse } from 'next/server'
import { sessionCookieOptions } from '@/lib/auth'
import { completePasswordReset } from '@/lib/password-reset'
import { clearLimit, clientIp, consumeLimit, loginEmailKey, tooManyAttempts } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** Новый пароль по ссылке из письма. При успехе — сразу вход в кабинет. */
export async function POST(request: Request) {
  // Токен угадать нельзя (256 бит), но и долбить маршрут незачем.
  const check = consumeLimit(`reset-confirm:${clientIp(request)}`, 20, 15 * 60 * 1000)
  if (!check.allowed) {
    const { body, headers } = tooManyAttempts(check.retryAfter)
    return NextResponse.json(body, { status: 429, headers })
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const result = await completePasswordReset(String(payload.token ?? ''), String(payload.password ?? ''))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  // Сброс по ссылке из письма доказывает, что почта — его. Если человек до
  // этого заблокировал себе вход неверными паролями, снимаем блокировку.
  clearLimit(loginEmailKey(result.user.email))

  const response = NextResponse.json({ ok: true })
  response.cookies.set({ ...sessionCookieOptions(), value: result.sessionToken })
  return response
}
