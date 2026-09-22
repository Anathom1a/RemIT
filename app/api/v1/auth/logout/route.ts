import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { config } from '@/lib/config'
import { destroyUserSession, sessionCookieOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const jar = await cookies()
  const token = jar.get(config.auth.cookieName)?.value
  if (token) await destroyUserSession(token)

  const response = NextResponse.json({ ok: true })
  response.cookies.set({ ...sessionCookieOptions(), value: '', maxAge: 0 })
  return response
}
