import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getLimitNotice } from '@/lib/limit-notice'
import { deviceSubject, getQuotaState, resolveSubject, userSubject } from '@/lib/quota'
import { getStore } from '@/lib/store'
import { getPlan } from '@/lib/plans'
import { formatDate, humanDuration } from '@/lib/time'

export const dynamic = 'force-dynamic'

/**
 * Состояние тарифа для самого клиента: остаток бесплатного времени и срок
 * подписки. Вызывается приложением на компьютере пользователя, поэтому
 * сервисный токен здесь не нужен — он не должен лежать в клиенте.
 *
 * Тело: { "id": "741208365", "uuid": "<uuid клиента>" }
 *
 * Клиент знает свой идентификатор и uuid; если у нас записан другой uuid для
 * этого идентификатора, запрос отклоняется — чтобы по чужому ID нельзя было
 * смотреть чужой остаток. Персональных данных ответ не содержит.
 */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const deviceId = String(payload.id ?? '').trim()
  const uuid = String(payload.uuid ?? '').trim()

  if (!deviceId) {
    return NextResponse.json({ error: 'Не передан идентификатор устройства' }, { status: 400 })
  }

  const store = await getStore()
  const device = await store.findDeviceByRustdeskId(deviceId)

  if (device && device.uuid && uuid && device.uuid !== uuid) {
    return NextResponse.json({ error: 'Устройство не совпадает' }, { status: 403 })
  }

  // Время расходует управляющая сторона, поэтому субъект считаем по этому же устройству.
  const subject = device?.userId
    ? userSubject(device.userId)
    : device
      ? await resolveSubject(store, deviceId, deviceId)
      : deviceSubject(deviceId)

  const state = await getQuotaState(subject)
  const subscription = device?.userId ? await store.getActiveSubscription(device.userId) : null
  const plan = getPlan(state.planId)
  const isTrial = subscription?.provider === 'trial'
  const site = config.rustdesk.apiServer.replace(/\/$/, '') || `https://${config.brand.domain}`

  // Разрывы по лимиту одновременных сессий за последние 15 минут. Карточка
  // в клиенте обновляется раз в минуту, так что человек увидит причину, пока
  // ещё помнит, что у него оборвалось подключение.
  const limitNotice = await getLimitNotice(subject, 15 * 60 * 1000)

  // Готовая строка для клиента: приложению остаётся только показать её.
  let message: string
  let alert = state.exhausted
  let linkUrl = state.exhausted ? `${site}/tarify` : `${site}/kabinet`
  let linkText = state.exhausted ? 'Посмотреть тарифы' : 'Личный кабинет'

  if (limitNotice && !state.exhausted) {
    message = `Подключение прервано: ${limitNotice.reason}`
    alert = true
    if (subject.userId) {
      linkUrl = `${site}${limitNotice.upgradePath}`
      linkText = limitNotice.target.negotiable
        ? 'Нужно больше сессий — напишите нам'
        : `Перейти на «${limitNotice.target.name}»`
    } else {
      // Без аккаунта повышать нечего: сначала регистрация и привязка устройства.
      linkUrl = `${site}/tarify`
      linkText = 'Посмотреть тарифы'
    }
  } else if (state.exhausted) {
    message = `Бесплатные ${humanDuration(state.limitSeconds ?? 0)} на сегодня израсходованы`
  } else if (state.limitSeconds === null && subscription) {
    message = isTrial
      ? `Пробный период до ${formatDate(subscription.expiresAt)}`
      : `Тариф «${plan.name}» до ${formatDate(subscription.expiresAt)}`
  } else if (state.limitSeconds === null) {
    message = `Тариф «${plan.name}» — без ограничения по времени`
  } else {
    message = `Осталось сегодня ${humanDuration(state.remainingSeconds ?? 0)}`
  }

  return NextResponse.json({
    plan: state.planId,
    planName: plan.name,
    trial: isTrial,
    unlimited: state.limitSeconds === null,
    limitSeconds: state.limitSeconds,
    usedSeconds: state.usedSeconds,
    remainingSeconds: state.remainingSeconds,
    exhausted: state.exhausted,
    concurrentLimit: state.concurrentLimit,
    activeSessions: state.activeSessions,
    resetAt: state.resetAt,
    expiresAt: subscription?.expiresAt ?? null,
    expiresAtText: subscription ? formatDate(subscription.expiresAt) : null,
    message,
    // Карточку выделить как предупреждение и куда вести по ссылке под ней.
    alert,
    linkUrl,
    linkText,
    // Только когда карточка говорит именно о разрыве: при исчерпанном
    // времени важнее сообщить о нём.
    limitCut:
      limitNotice && !state.exhausted
        ? { count: limitNotice.count, lastAt: limitNotice.lastAt, target: limitNotice.target.id }
        : null,
    // Куда вести пользователя из клиента.
    siteUrl: site,
    tariffUrl: `${site}/tarify`,
    cabinetUrl: `${site}/kabinet`,
  })
}
