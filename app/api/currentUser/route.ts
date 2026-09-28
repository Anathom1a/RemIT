import { NextResponse } from 'next/server'
import { clientRoute, userPayload } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Клиент проверяет вход при запуске: 401 — войти заново. */
export const POST = clientRoute(async ({ user }) => NextResponse.json(userPayload(user)))
