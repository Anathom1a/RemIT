import { NextResponse } from 'next/server'
import { createUserSession, normalizeEmail, sessionCookieOptions, verifyPassword } from '@/lib/auth'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const email = normalizeEmail(String(payload.email ?? ''))
  const password = String(payload.password ?? '')

  const store = await getStore()
  const user = await store.findUserByEmail(email)
  // Одинаковый ответ на «нет пользователя» и «неверный пароль» — не подсказываем перебором.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Неверная почта или пароль' }, { status: 401 })
  }

  const token = await createUserSession(user.id)
  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name })
  response.cookies.set({ ...sessionCookieOptions(), value: token })
  return response
}
