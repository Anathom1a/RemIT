import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getStore } from '@/lib/store'
import type { TicketStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const STATUSES: TicketStatus[] = ['new', 'in_progress', 'answered', 'closed']

/** Все обращения — для поддержки. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  const store = await getStore()
  const tickets = await store.listTickets(200)
  const users = await Promise.all(tickets.map((ticket) => store.findUserById(ticket.userId)))
  return NextResponse.json({
    tickets: tickets.map((ticket, index) => ({ ...ticket, email: users[index]?.email ?? '' })),
  })
}

/** Ответ на обращение или смена статуса. */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(payload.id ?? '').trim()
  const answer = String(payload.answer ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, (char) => (char === '\n' ? '\n' : ' '))
    .trim()
    .slice(0, 4000)
  const status = String(payload.status ?? '') as TicketStatus

  const store = await getStore()
  const ticket = await store.findTicket(id)
  if (!ticket) return NextResponse.json({ error: 'Обращение не найдено' }, { status: 404 })

  if (status && !STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Неизвестный статус' }, { status: 400 })
  }

  const now = new Date().toISOString()
  if (answer) {
    ticket.answer = answer
    ticket.answeredAt = now
    // Ответ сам по себе переводит обращение в «отвечено», если статус не задан.
    ticket.status = status || 'answered'
  } else if (status) {
    ticket.status = status
  }
  ticket.updatedAt = now
  await store.saveTicket(ticket)

  return NextResponse.json({ ok: true, ticket })
}
