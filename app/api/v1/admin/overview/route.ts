import { NextResponse } from 'next/server'
import { checkRustdeskApi, denyIfNotAdmin, getAdminOverview } from '@/lib/admin'
import { getRuntimeSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/** Сводка для админки: пользователи, подписки, выручка, сессии, расход времени. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const settings = await getRuntimeSettings()
  const [overview, api] = await Promise.all([getAdminOverview(settings.freeSecondsPerDay), checkRustdeskApi()])
  return NextResponse.json({ overview, api, settings })
}
