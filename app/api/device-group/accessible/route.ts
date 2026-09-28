import { NextResponse } from 'next/server'
import { clientRoute } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Группы устройств. Не используем — пустой список, чтобы клиент не показывал ошибку. */
export const GET = clientRoute(async () => NextResponse.json({ total: 0, data: [] }))
