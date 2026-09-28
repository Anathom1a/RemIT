import { NextResponse } from 'next/server'
import { clientRoute } from '@/lib/client-api'
import { accessibleForClient } from '@/lib/teams'

export const dynamic = 'force-dynamic'

/** Группы устройств вашей команды. */
export const GET = clientRoute(async ({ user }) => {
  const { groups } = await accessibleForClient(user)
  return NextResponse.json({ total: groups.length, data: groups.map((group) => ({ id: group.id, name: group.name })) })
})
