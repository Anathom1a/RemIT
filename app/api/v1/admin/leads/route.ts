import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { activateTrial } from '@/lib/billing'
import { config } from '@/lib/config'
import { PLANS_BY_ID, isFreePlan, type PlanId } from '@/lib/plans'
import { getStore } from '@/lib/store'
import type { LeadStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Заявки с сайта для админки. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const url = new URL(request.url)
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))

  const store = await getStore()
  const leads = await store.listLeads(limit)

  // Сразу показываем, есть ли у заявителя аккаунт: от этого зависит, можно ли выдать пробу.
  const rows = await Promise.all(
    leads.map(async (lead) => {
      const user = await store.findUserByEmail(lead.email)
      return { ...lead, userId: user?.id ?? null }
    }),
  )

  return NextResponse.json({ leads: rows })
}

/**
 * Работа с заявкой: выдать пробный период, отметить статус, записать заметку.
 *
 * Тело: { id, action: "trial" | "status" | "note", plan?, days?, status?, note? }
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const id = String(payload.id ?? '')
  const action = String(payload.action ?? 'status')

  const store = await getStore()
  const lead = await store.findLead(id)
  if (!lead) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })

  if (action === 'trial') {
    const user = await store.findUserByEmail(lead.email)
    if (!user) {
      return NextResponse.json(
        {
          error:
            'Аккаунт с этой почтой не найден. Попросите клиента зарегистрироваться на сайте — после этого пробный период выдастся одной кнопкой.',
        },
        { status: 404 },
      )
    }

    const plan = String(payload.plan ?? config.trial.defaultPlan) as PlanId
    if (!(plan in PLANS_BY_ID) || isFreePlan(plan)) {
      return NextResponse.json({ error: 'Неизвестный тариф' }, { status: 400 })
    }

    const concurrentSessions =
      payload.concurrent === undefined || payload.concurrent === null || payload.concurrent === ''
        ? undefined
        : Math.min(1000, Math.max(1, Number.parseInt(String(payload.concurrent), 10) || 0))

    const days = Math.min(
      config.trial.maxDays,
      Math.max(1, Number.parseInt(String(payload.days ?? config.trial.defaultDays), 10) || config.trial.defaultDays),
    )

    const subscription = await activateTrial(user.id, plan, days, concurrentSessions)
    await store.saveLead({
      ...lead,
      status: 'approved',
      note: payload.note === undefined ? lead.note : String(payload.note).slice(0, 1000),
      handledAt: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, subscription, days })
  }

  if (action === 'note') {
    await store.saveLead({ ...lead, note: String(payload.note ?? '').slice(0, 1000) })
    return NextResponse.json({ ok: true })
  }

  const status = String(payload.status ?? '') as LeadStatus
  if (!['new', 'in_progress', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Неизвестный статус' }, { status: 400 })
  }

  await store.saveLead({
    ...lead,
    status,
    handledAt: status === 'new' ? null : new Date().toISOString(),
  })
  return NextResponse.json({ ok: true, status })
}
