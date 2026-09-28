import { NextResponse } from 'next/server'
import { clientRoute, guestPayload, userPayload } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Клиент проверяет вход при запуске: 401 — войти заново. */
export const POST = clientRoute(async ({ user, token }) => NextResponse.json(token.scope === 'share' ? guestPayload() : userPayload(user)), {
  // Гостю по ссылке тоже отвечаем, иначе веб-клиент сотрёт его токен.
  allowShare: true,
})
