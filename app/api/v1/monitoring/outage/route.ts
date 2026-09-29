import { NextResponse } from 'next/server'
import { isServiceRequest } from '@/lib/auth'
import { recordSiteOutage } from '@/lib/monitoring'

export const dynamic = 'force-dynamic'

/**
 * Сторож сообщает о простое сайта, когда тот снова ответил:
 * {"from": "2026-09-29T10:00:00Z", "to": "2026-09-29T10:07:00Z"}.
 */
export async function POST(request: Request) {
  if (!isServiceRequest(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const from = new Date(String(body.from ?? ''))
  const to = new Date(String(body.to ?? ''))
  const span = to.getTime() - from.getTime()
  if (!Number.isFinite(span) || span <= 0 || span > 30 * 24 * 60 * 60 * 1000 || to.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: 'Некорректный интервал' }, { status: 400 })
  }
  await recordSiteOutage(from, to)
  console.info(`[monitor] простой сайта ${from.toISOString()} — ${to.toISOString()}`)
  return NextResponse.json({ ok: true })
}
