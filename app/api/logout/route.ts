import { NextResponse } from 'next/server'
import { revokeClientTokenByRaw } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Выход в клиенте: токен больше не действует. */
export async function POST(request: Request) {
  await revokeClientTokenByRaw(request)
  return NextResponse.json(null)
}
