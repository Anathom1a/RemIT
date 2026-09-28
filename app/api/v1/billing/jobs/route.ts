import { NextResponse } from 'next/server'
import { isServiceRequest } from '@/lib/auth'
import { runBillingJobs } from '@/lib/billing-jobs'

export const dynamic = 'force-dynamic'

/**
 * Автопродление и чеки для внешнего планировщика (cron на сервере):
 *   curl -X POST -H "Authorization: Bearer $REMIT_SERVICE_TOKEN" https://<домен>/api/v1/billing/jobs
 * Без него задачи всё равно идут попутно с heartbeat клиентов.
 */
export async function POST(request: Request) {
  if (!isServiceRequest(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return NextResponse.json({ ok: true, report: await runBillingJobs() })
}
