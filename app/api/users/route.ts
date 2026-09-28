import { NextResponse } from 'next/server'
import { clientRoute, userPayload } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Вкладка «Доступные устройства»: пользователи, чьи устройства видны. Пока — только вы. */
export const GET = clientRoute(async ({ user }) => NextResponse.json({ total: 1, data: [userPayload(user)] }))
