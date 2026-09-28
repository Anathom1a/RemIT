import { NextResponse } from 'next/server'
import { deleteAccount } from '@/lib/accounts'
import { getCurrentUser, sessionCookieOptions, verifyPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Удаление аккаунта владельцем. Подтверждение — пароль, а если пароля нет
 * (вход только через VK ID) — почта аккаунта.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const confirmed = user.passwordHash
    ? await verifyPassword(String(body.password ?? ''), user.passwordHash)
    : String(body.email ?? '').trim().toLowerCase() === user.email
  if (!confirmed) {
    return NextResponse.json({ error: user.passwordHash ? 'Неверный пароль' : 'Введите почту аккаунта' }, { status: 400 })
  }
  await deleteAccount(user.id)
  const response = NextResponse.json({ ok: true })
  response.cookies.set({ ...sessionCookieOptions(), value: '', maxAge: 0 })
  return response
}
