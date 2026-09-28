import { NextResponse } from 'next/server'
import { clientRoute, userPayload } from '@/lib/client-api'
import { accessibleForClient } from '@/lib/teams'

export const dynamic = 'force-dynamic'

/** Вкладка «Доступные устройства»: вы и участники вашей команды. */
export const GET = clientRoute(async ({ user }, request) => {
  const url = new URL(request.url)
  const current = Math.max(1, Number(url.searchParams.get('current')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 100))
  const { users } = await accessibleForClient(user)
  const page = users.slice((current - 1) * pageSize, current * pageSize)
  return NextResponse.json({ total: users.length, data: page.map(userPayload) })
})
