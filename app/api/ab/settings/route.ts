import { NextResponse } from 'next/server'
import { clientRoute } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** 0 — без ограничения числа записей в книге со стороны клиента. */
export const POST = clientRoute(async () => NextResponse.json({ max_peer_one_ab: 0 }))
