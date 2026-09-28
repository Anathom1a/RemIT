import { NextResponse } from 'next/server'
import { clientRoute } from '@/lib/client-api'
import { serverInfo } from '@/lib/webclient'

export const dynamic = 'force-dynamic'

export const POST = clientRoute(async () => NextResponse.json({ code: 0, message: 'success', data: serverInfo() }))
