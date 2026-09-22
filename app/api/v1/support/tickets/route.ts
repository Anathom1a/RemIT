import { NextResponse } from 'next/server'
import { getCurrentUser, newId } from '@/lib/auth'
import { config } from '@/lib/config'
import { notifyTelegram } from '@/lib/notify'
import { storeAttachment } from '@/lib/storage'
import { getStore } from '@/lib/store'
import type { SupportTicket, TicketAttachment } from '@/lib/types'

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
 *
 * Форма отправляет multipart, чтобы вместе с текстом приложить снимки
 * экрана. Тело в JSON тоже принимаем — так удобнее для скриптов.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const isForm = (request.headers.get('content-type') ?? '').includes('multipart/form-data')
  let subject = ''
  let message = ''
  let files: File[] = []

  if (isForm) {
    const form = await request.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Не удалось прочитать форму' }, { status: 400 })
    subject = clean(form.get('subject'), MAX_SUBJECT)
    message = clean(form.get('message'), MAX_MESSAGE)
    files = form.getAll('files').filter((item): item is File => item instanceof File && item.size > 0)
  } else {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
    subject = clean(payload.subject, MAX_SUBJECT)
    message = clean(payload.message, MAX_MESSAGE)
  }

  if (subject.length < 3) {
    return NextResponse.json({ error: 'Коротко опишите тему обращения' }, { status: 400 })
  }
  if (message.length < 10) {
    return NextResponse.json(
      { error: 'Опишите, что произошло: так мы ответим по делу с первого раза' },
      { status: 400 },
    )
  }

  const { maxAttachmentBytes, maxAttachmentsPerTicket } = config.storage
  if (files.length > maxAttachmentsPerTicket) {
    return NextResponse.json(
      { error: `Можно приложить не больше ${maxAttachmentsPerTicket} файлов` },
      { status: 400 },
    )
  }
  const tooBig = files.find((file) => file.size > maxAttachmentBytes)
  if (tooBig) {
    const limit = Math.round(maxAttachmentBytes / (1024 * 1024))
    return NextResponse.json({ error: `Файл больше ${limit} МБ` }, { status: 413 })
  }

  const store = await getStore()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  if ((await store.countRecentTickets(user.id, since)) >= MAX_PER_DAY) {
    return NextResponse.json(
      { error: 'За сутки принято слишком много обращений. Ответим по уже открытым.' },
      { status: 429 },
    )
  }

  const id = newId('ticket')

  // Формат проверяем по первым байтам файла: расширение и заявленный тип
  // приходят от браузера, и полагаться на них нельзя.
  const attachments: TicketAttachment[] = []
  for (const [index, file] of files.entries()) {
    const data = new Uint8Array(await file.arrayBuffer())
    const stored = await storeAttachment(id, index, data)
    if (!stored) {
      return NextResponse.json(
        { error: 'Прикладывать можно только изображения: PNG, JPEG, WebP, GIF или HEIC' },
        { status: 415 },
      )
    }
    attachments.push(stored)
  }

  const now = new Date().toISOString()
  const ticket: SupportTicket = {
    id,
    userId: user.id,
    subject,
    message,
    status: 'new',
    answer: '',
    attachments,
    createdAt: now,
    updatedAt: now,
    answeredAt: null,
  }
  await store.createTicket(ticket)

  // Уведомление уходит в бот поддержки: адрес задаётся переменными окружения.
  await notifyTelegram(
    `Новое обращение в поддержку\n${user.email}\nТема: ${subject}` +
      (attachments.length ? `\nФайлов: ${attachments.length}` : '') +
      `\n\n${message.slice(0, 500)}`,
  )

  return NextResponse.json({ ok: true, ticket })
}
