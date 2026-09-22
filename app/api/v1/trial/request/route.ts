import { NextResponse } from 'next/server'
import { isValidEmail, newId, normalizeEmail } from '@/lib/auth'
import { config } from '@/lib/config'
import { notifyTelegram } from '@/lib/notify'
import { getStore } from '@/lib/store'
import type { Lead } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Одна компания не должна засыпать нас заявками. */
const MAX_PER_DAY = 3

function clean(value: unknown, limit: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, limit)
}

/**
 * Заявка на пробный период. Публичный маршрут: форму заполняют компании
 * с сайта, авторизация не нужна.
 */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const email = normalizeEmail(String(payload.email ?? ''))
  const name = clean(payload.name, 120)
  const company = clean(payload.company, 160)
  const phone = clean(payload.phone, 40)
  const devices = clean(payload.devices, 40)
  const comment = clean(payload.comment, 1000)
  // Приманка для ботов: настоящий человек это поле не заполняет.
  const trap = clean(payload.website, 200)

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Укажите рабочую почту, на неё пришлём доступ' }, { status: 400 })
  }
  if (name.length < 2) {
    return NextResponse.json({ error: 'Как к вам обращаться?' }, { status: 400 })
  }
  if (trap) {
    // Боту отвечаем успехом, но ничего не сохраняем.
    return NextResponse.json({ ok: true })
  }

  const store = await getStore()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  if ((await store.countRecentLeads(email, since)) >= MAX_PER_DAY) {
    return NextResponse.json(
      { error: `Заявка с этой почты уже принята. Мы свяжемся с вами — или напишите в поддержку: ${config.brand.supportUrl}` },
      { status: 429 },
    )
  }

  const lead: Lead = {
    id: newId('lead'),
    kind: 'trial',
    name,
    company,
    email,
    phone,
    devices,
    comment,
    status: 'new',
    note: '',
    createdAt: new Date().toISOString(),
    handledAt: null,
  }
  await store.createLead(lead)

  await notifyTelegram(
    [
      '<b>Заявка на пробный период</b>',
      `Имя: ${name}`,
      company ? `Компания: ${company}` : '',
      `Почта: ${email}`,
      phone ? `Телефон: ${phone}` : '',
      devices ? `Устройств: ${devices}` : '',
      comment ? `Комментарий: ${comment}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return NextResponse.json({ ok: true, trialDays: config.trial.maxDays })
}
