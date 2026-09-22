import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { getCurrentUser } from '@/lib/auth'
import { statAttachment, streamAttachment } from '@/lib/storage'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Снимок экрана из обращения.
 *
 * Отдаём только автору обращения и поддержке: на скриншоте может быть видно
 * что угодно — от адресной книги до чужого рабочего стола, поэтому ссылка
 * не должна работать «для всех, кто её знает».
 */
async function handle(ticketId: string, file: string, method: 'GET' | 'HEAD') {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const store = await getStore()
  const ticket = await store.findTicket(ticketId)
  if (!ticket) return NextResponse.json({ error: 'Обращение не найдено' }, { status: 404 })
  if (ticket.userId !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Имя должно совпадать с тем, что записано в обращении: на диск ходим
  // только за файлами, про которые точно знаем, что они из этого обращения.
  if (!ticket.attachments.some((attachment) => attachment.name === file)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 404 })
  }

  const found = await statAttachment(ticketId, file)
  if (!found) return NextResponse.json({ error: 'Файл не найден' }, { status: 404 })

  return streamAttachment(found.path, file, found.size, method)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string; file: string }> },
) {
  const { ticketId, file } = await params
  return handle(decodeURIComponent(ticketId), decodeURIComponent(file), 'GET')
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string; file: string }> },
) {
  const { ticketId, file } = await params
  return handle(decodeURIComponent(ticketId), decodeURIComponent(file), 'HEAD')
}
