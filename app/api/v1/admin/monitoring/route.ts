import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { IncidentError, createIncident, updateIncident } from '@/lib/incidents'
import { readMonitorState, runMonitoring, sendAlert } from '@/lib/monitoring'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Состояние проверок, последние события и инциденты. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  const store = await getStore()
  const [state, events, incidents] = await Promise.all([
    readMonitorState(),
    store.listMonitorEvents(100),
    store.listIncidents(50),
  ])
  return NextResponse.json({ state, events, incidents })
}

/**
 * Действия: run — проверить сейчас; test-alert — тестовое оповещение;
 * incident-create {title, impact, components, text, startsAt?, endsAt?};
 * incident-update {id, status, text}.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    switch (body.action) {
      case 'run':
        return NextResponse.json({ ok: true, report: await runMonitoring() })
      case 'test-alert': {
        const sent = await sendAlert(['🧪 Тестовое оповещение мониторинга: если вы это читаете, канал работает.'])
        if (!sent.telegram && !sent.email) {
          return NextResponse.json(
            { error: 'Не отправлено: настройте REMIT_TELEGRAM_BOT_TOKEN и чат или почту (SMTP)' },
            { status: 400 },
          )
        }
        return NextResponse.json({ ok: true, ...sent })
      }
      case 'incident-create':
        return NextResponse.json({ ok: true, incident: await createIncident(body) })
      case 'incident-update':
        return NextResponse.json({ ok: true, incident: await updateIncident(String(body.id ?? ''), body) })
      default:
        return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }
  } catch (error) {
    if (error instanceof IncidentError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}
