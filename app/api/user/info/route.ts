import { NextResponse } from 'next/server'
import { clientRoute, userPayload } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

export const GET = clientRoute(async ({ user }) => NextResponse.json(userPayload(user)))
