import { getPlan, sessionsWord, upgradeTargetForSessions, type Plan } from './plans'
import { getQuotaState, type QuotaSubject } from './quota'
import { getStore } from './store'

/**
 * Уведомление «не хватило одновременных сессий».
 *
 * Сессия, превысившая лимит, разрывается без объяснений со стороны самого
 * протокола RustDesk: человек видит только оборванное подключение. Поэтому
 * причину и выход — перейти на тариф с большим числом сессий — показываем
 * там, куда он посмотрит: в карточке тарифа в окне клиента и в кабинете.
 */

export interface LimitNotice {
  /** Сколько подключений разорвано за окно наблюдения. */
  count: number
  lastAt: string
  limit: number
  planName: string
  /** Тариф, на который предлагаем перейти. */
  target: Plan
  /** Путь в кабинете: доплата за повышение, покупка или договорной тариф. */
  upgradePath: string
  /** «на тарифе «Профи» одновременно доступно 3 сессии». */
  reason: string
}

export function upgradePathFor(target: Plan): string {
  return target.negotiable ? '/kabinet/podpiska#corporate' : `/kabinet/podpiska?upgrade=${target.id}#plan-${target.id}`
}

/**
 * Были ли разрывы по лимиту за последние windowMs миллисекунд. null — не было,
 * и показывать нечего.
 */
export async function getLimitNotice(
  subject: QuotaSubject,
  windowMs: number,
  now = new Date(),
): Promise<LimitNotice | null> {
  const store = await getStore()
  const since = new Date(now.getTime() - windowMs).toISOString()
  const { count, lastAt } = await store.countLimitCuts(subject.key, since)
  if (count === 0 || !lastAt) return null

  const state = await getQuotaState(subject, now)
  const plan = getPlan(state.planId)
  const target = upgradeTargetForSessions(state.concurrentLimit, plan.id)

  return {
    count,
    lastAt,
    limit: state.concurrentLimit,
    planName: plan.name,
    target,
    upgradePath: upgradePathFor(target),
    reason: `на тарифе «${plan.name}» одновременно доступно ${state.concurrentLimit} ${sessionsWord(state.concurrentLimit)}`,
  }
}
