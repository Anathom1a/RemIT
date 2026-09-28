import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { runBillingJobs } from '@/lib/billing-jobs'

export const dynamic = 'force-dynamic'

/** Кнопка в админке: автопродление и чеки прямо сейчас. */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  return NextResponse.json({ ok: true, report: await runBillingJobs() })
}
