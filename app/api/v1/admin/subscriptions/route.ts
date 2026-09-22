import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { activateSubscription, activateTrial } from '@/lib/billing'
import { config } from '@/lib/config'
import { PLANS_BY_ID, getPlan, isFreePlan, type PlanId } from '@/lib/plans'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Активные подписки — для раздела «Подписки» в админке. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const store = await getStore()
  const subscriptions = await store.listActiveSubscriptions()
  const rows = await Promise.all(
    subscriptions.map(async (subscription) => ({
      ...subscription,
      email: (await store.findUserById(subscription.userId))?.email ?? '—',
    })),
  )
  return NextResponse.json({ subscriptions: rows })
}

/**
 * Выдача и отмена подписки вручную: оплата по счёту, компенсация,
 * тестовый доступ или партнёрские условия.
 *
 * Действия:
 *   grant  — выдать или продлить подписку; для корпоративного тарифа можно
 *            сразу указать согласованное число одновременных сессий;
 *   trial  — выдать пробный период на N дней (не дольше максимума из настроек);
 *   limits — изменить число одновременных сессий у действующей подписки;
 *   cancel — отменить подписку.
 *
 * Пробный период выдаёт только администратор: самостоятельной активации на
 * сайте нет, это защищает от бесплатного доступа без ограничения времени
 * для случайных людей.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const action = String(payload.action ?? 'grant')
  const userId = String(payload.userId ?? '')

  const store = await getStore()
  const user = await store.findUserById(userId)
  if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

  if (action === 'trial') {
    const plan = String(payload.plan ?? config.trial.defaultPlan) as PlanId
    if (!(plan in PLANS_BY_ID) || isFreePlan(plan)) {
      return NextResponse.json({ error: 'Неизвестный тариф' }, { status: 400 })
    }

    const days = Math.min(
      config.trial.maxDays,
      Math.max(
        1,
        Number.parseInt(String(payload.days ?? config.trial.defaultDays), 10) || config.trial.defaultDays,
      ),
    )
    const concurrentSessions =
      payload.concurrent === undefined || payload.concurrent === null || payload.concurrent === ''
        ? undefined
        : Math.min(1000, Math.max(1, Number.parseInt(String(payload.concurrent), 10) || 0))

    const subscription = await activateTrial(userId, plan, days, concurrentSessions)
    return NextResponse.json({ ok: true, subscription, days })
  }

  if (action === 'limits') {
    const current = await store.getActiveSubscription(userId)
    if (!current) return NextResponse.json({ error: 'Активной подписки нет' }, { status: 404 })

    const raw = payload.concurrent
    // null или пустая строка — вернуть значение тарифа.
    const concurrentSessions =
      raw === null || raw === '' || raw === undefined
        ? null
        : Math.min(1000, Math.max(1, Number.parseInt(String(raw), 10) || 0))

    if (concurrentSessions !== null && concurrentSessions < 1) {
      return NextResponse.json({ error: 'Число сессий должно быть от 1 до 1000' }, { status: 400 })
    }

    const updated = { ...current, concurrentSessions }
    await store.saveSubscription(updated)
    return NextResponse.json({
      ok: true,
      subscription: updated,
      effectiveLimit: concurrentSessions ?? getPlan(current.plan).concurrentSessions,
    })
  }

  if (action === 'cancel') {
    const current = await store.getActiveSubscription(userId)
    if (!current) return NextResponse.json({ error: 'Активной подписки нет' }, { status: 404 })
    await store.saveSubscription({ ...current, status: 'canceled' })
    return NextResponse.json({ ok: true, action: 'cancel' })
  }

  const plan = String(payload.plan ?? '') as PlanId
  const months = Math.min(36, Math.max(1, Number.parseInt(String(payload.months ?? '1'), 10) || 1))
  if (!(plan in PLANS_BY_ID) || isFreePlan(plan)) {
    return NextResponse.json({ error: 'Неизвестный тариф' }, { status: 400 })
  }

  const concurrentSessions =
    payload.concurrent === undefined || payload.concurrent === null || payload.concurrent === ''
      ? undefined
      : Math.min(1000, Math.max(1, Number.parseInt(String(payload.concurrent), 10) || 0))

  const subscription = await activateSubscription(userId, plan, months, 'admin', 'manual', concurrentSessions)
  return NextResponse.json({
    ok: true,
    subscription,
    effectiveLimit: subscription.concurrentSessions ?? getPlan(plan).concurrentSessions,
  })
}
