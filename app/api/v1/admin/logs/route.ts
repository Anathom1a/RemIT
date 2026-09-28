import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Ручная чистка журналов: файлы (file), тревоги (alarm), входы в клиенте (login).
 *   {action: "delete", kind, id} — одна запись;
 *   {action: "purge", kind, days} — всё старше days дней.
 * Действующие входы в клиенте не удаляются — их сначала завершают.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const kind = String(body.kind ?? '')
  const store = await getStore()
  const now = new Date().toISOString()

  if (body.action === 'delete') {
    const id = String(body.id ?? '')
    if (kind === 'file') await store.deleteFileAudit(id)
    else if (kind === 'alarm') await store.deleteAlarm(id)
    else if (kind === 'login') {
      if (!(await store.deleteClientToken(id, now))) {
        return NextResponse.json({ error: 'Действующий вход сначала завершите' }, { status: 400 })
      }
    } else return NextResponse.json({ error: 'Неизвестный журнал' }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'purge') {
    const days = Math.max(0, Math.floor(Number(body.days)))
    if (!Number.isFinite(days)) return NextResponse.json({ error: 'Укажите число дней' }, { status: 400 })
    const before = new Date(Date.now() - days * DAY_MS).toISOString()
    let removed = 0
    if (kind === 'file') removed = await store.deleteFileAuditsBefore(before)
    else if (kind === 'alarm') removed = await store.deleteAlarmsBefore(before)
    else if (kind === 'login') removed = await store.deleteClientTokensBefore(before, now)
    else return NextResponse.json({ error: 'Неизвестный журнал' }, { status: 400 })
    return NextResponse.json({ ok: true, removed })
  }

  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
}
