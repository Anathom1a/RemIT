import { NextResponse } from 'next/server'
import {
  createUserSession,
  hashPassword,
  isValidEmail,
  newId,
  normalizeEmail,
  sessionCookieOptions,
} from '@/lib/auth'
import { clientIp, consumeLimit, tooManyAttempts } from '@/lib/rate-limit'
import { getStore } from '@/lib/store'
import { getRuntimeSettings } from '@/lib/settings'
import type { User } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const settings = await getRuntimeSettings()
  if (!settings.registrationEnabled) {
    return NextResponse.json(
      { error: 'Регистрация временно закрыта. Напишите в поддержку, мы создадим аккаунт вручную.' },
      { status: 403 },
    )
  }

  // Регистрации с одного адреса: 10 в час. Хватает офису, мешает ферме
  // бесплатных аккаунтов и перебору «занята ли почта».
  const check = consumeLimit(`register-ip:${clientIp(request)}`, 10, 60 * 60 * 1000)
  if (!check.allowed) {
    const { body, headers } = tooManyAttempts(check.retryAfter)
    return NextResponse.json(body, { status: 429, headers })
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const email = normalizeEmail(String(payload.email ?? ''))
  const password = String(payload.password ?? '')
  const name = String(payload.name ?? '').trim()

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Укажите корректный адрес электронной почты' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Пароль должен быть не короче 8 символов' }, { status: 400 })
  }

  const store = await getStore()
  if (await store.findUserByEmail(email)) {
    return NextResponse.json({ error: 'Аккаунт с такой почтой уже существует' }, { status: 409 })
  }

  const user: User = {
    id: newId('usr'),
    email,
    name: name || email.split('@')[0],
    passwordHash: await hashPassword(password),
    role: 'user',
    createdAt: new Date().toISOString(),
  }
  await store.createUser(user)

  const token = await createUserSession(user.id)
  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name })
  response.cookies.set({ ...sessionCookieOptions(), value: token })
  return response
}
