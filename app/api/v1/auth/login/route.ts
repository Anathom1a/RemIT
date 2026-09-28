import { NextResponse } from 'next/server'
import { createUserSession, normalizeEmail, sessionCookieOptions } from '@/lib/auth'
import { checkCredentials, clearLoginFailures, loginBlocked, recordLoginFailure } from '@/lib/login-guard'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const email = normalizeEmail(String(payload.email ?? ''))
  const password = String(payload.password ?? '')

  const blocked = loginBlocked(request, email)
  if (blocked) return NextResponse.json(blocked.body, { status: 429, headers: blocked.headers })

  const { user, valid } = await checkCredentials(email, password)

  // Одинаковый ответ на «нет пользователя» и «неверный пароль» — не подсказываем перебором.
  if (!user || !valid) {
    recordLoginFailure(request, email)
    return NextResponse.json({ error: 'Неверная почта или пароль' }, { status: 401 })
  }

  clearLoginFailures(email)
  const token = await createUserSession(user.id)
  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name })
  response.cookies.set({ ...sessionCookieOptions(), value: token })
  return response
}
