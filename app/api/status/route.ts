import { NextResponse } from 'next/server'
import { getPublicStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'

/** Состояние сервиса в JSON — то же, что на странице /status. */
export async function GET() {
  const page = await getPublicStatus()
  return NextResponse.json(
    {
      status: page.status,
      updatedAt: page.updatedAt,
      components: page.components.map(({ id, name, status, uptime90 }) => ({ id, name, status, uptime90 })),
      active: page.active,
      upcoming: page.upcoming,
    },
    { headers: { 'Cache-Control': 'public, max-age=30', 'Access-Control-Allow-Origin': '*' } },
  )
}
