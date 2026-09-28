import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Способы входа кроме пароля (OIDC). У нас только почта и пароль. */
export function GET() {
  return NextResponse.json([])
}
