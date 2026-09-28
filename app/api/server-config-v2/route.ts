import { NextResponse } from 'next/server'
import { clientRoute } from '@/lib/client-api'
import { WEBCLIENT_PAID_ONLY, hasWebClient, serverInfo } from '@/lib/webclient'

export const dynamic = 'force-dynamic'

export const POST = clientRoute(async ({ user }) =>
  (await hasWebClient(user.id))
    ? NextResponse.json({ code: 0, message: 'success', data: serverInfo() })
    : NextResponse.json({ code: 101, message: WEBCLIENT_PAID_ONLY, data: null }),
)
