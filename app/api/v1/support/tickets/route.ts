import { NextResponse } from 'next/server'
import { getCurrentUser, newId } from '@/lib/auth'
import { notifyTelegram } from '@/lib/notify'
import { getStore } from '@/lib/store'
import type { SupportTicket } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Сколько обращений в сутки принимаем от одного аккаунта. */
const MAX_PER_DAY = 10
const MAX_SUBJECT = 160
const MAX_MESSAGE = 4000

function clean(value: unknown, limit: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, (char) => (char === '\n' ? '\n' : ' '))
    .trim()
    .slice(0, limit)
}

/** Свои обращения: пользователь видит статус и ответ поддержки. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const store = await getStore()
  return NextResponse.json({ tickets: await store.listUserTickets(user.id, 50) })
}

/**
 * Новое обращение. Только для авторизованных: почта и имя берутся из
 * аккаунта, поэтому написать от чужого имени нельзя и капча не нужна.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const subject = clean(payload.subject, MAX_SUBJECT)
  const message = clean(payload.message, MAX_MESSAGE)

  if (subject.length < 3) {
    return NextResponse.json({ error: 'Коротко опишите тему обращения' }, { status: 400 })
  }
  if (message.length < 10) {
    return NextResponse.json(
      { error: 'Опишите, что произошло: так мы ответим по делу с первого раза' },
      { status: 400 },
    )
  }

  const store = await getStore()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  if ((await store.countRecentTickets(user.id, since)) >= MAX_PER_DAY) {
    return NextResponse.json(
      { error: 'За сутки принято слишком много обращений. Ответим по уже открытым.' },
      { status: 429 },
    )
  }

  const now = new Date().toISOString()
  const ticket: SupportTicket = {
    id: newId('ticket'),
    userId: user.id,
    subject,
    message,
    status: 'new',
    answer: '',
    createdAt: now,
    updatedAt: now,
    answeredAt: null,
  }
  await store.createTicket(ticket)

  // Уведомление уходит в бот поддержки: адрес задаётся переменными окружения.
  await notifyTelegram(
    `Новое обращение в поддержку\n${user.email}\nТема: ${subject}\n\n${message.slice(0, 500)}`,
  )

  return NextResponse.json({ ok: true, ticket })
}
