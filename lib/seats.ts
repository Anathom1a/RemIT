import { getPlan, isPaidPlan, type Plan } from './plans'
import { getStore, type Store } from './store'
import type { Subscription, Team, TeamMember } from './types'

/**
 * Места в команде. Оплаченный тариф владельца команды распространяется на
 * участников, которым выдано место: каждый работает под своим аккаунтом (своя
 * история, свои входы), а одновременные сессии тарифа — общий пул команды.
 *
 * Мест столько же, сколько одновременных сессий в тарифе (у корпоративного —
 * по договору), и одно из них всегда у владельца. Участник со своей
 * подпиской работает по ней и места не занимает.
 */

export interface SeatInfo {
  /** Всего мест по тарифу владельца; 0 — тариф бесплатный, мест нет. */
  total: number
  /** Занято, считая владельца. */
  used: number
  /** Кто работает по тарифу владельца: владелец и участники в пределах мест. */
  holders: string[]
  /** Участники с отметкой места сверх лимита (тариф понизили). */
  overflow: string[]
  ownerSubscription: Subscription | null
}

export interface PlanAccess {
  plan: Plan
  /** Подписка, по которой работает человек: своя или владельца команды. */
  subscription: Subscription | null
  /** Работает по месту в команде. */
  viaTeam: { teamId: string; teamName: string; ownerId: string } | null
  /** Субъекты квоты, чьи сессии делят один лимит одновременных сессий. */
  poolKeys: string[]
  concurrentLimit: number
}

const userKey = (userId: string) => `user:${userId}`

/** Мест по подписке владельца. */
export function seatsOf(subscription: Subscription | null): number {
  if (!subscription || !isPaidPlan(subscription.plan)) return 0
  return subscription.concurrentSessions ?? getPlan(subscription.plan).concurrentSessions
}

const seatRoles = new Set<TeamMember['role']>(['admin', 'member'])

export async function teamSeats(store: Store, team: Team, members?: TeamMember[]): Promise<SeatInfo> {
  const ownerSubscription = await store.getActiveSubscription(team.ownerId)
  const total = seatsOf(ownerSubscription)
  const seated = (members ?? (await store.listTeamMembers(team.id)))
    .filter((member) => member.seat && seatRoles.has(member.role))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const inside = total > 0 ? seated.slice(0, total - 1) : []
  return {
    total,
    used: total > 0 ? 1 + seated.length : 0,
    holders: total > 0 ? [team.ownerId, ...inside.map((member) => member.userId)] : [],
    overflow: seated.slice(inside.length).map((member) => member.userId),
    ownerSubscription,
  }
}

/** Общий пул: владелец и держатели мест без собственной подписки. */
async function poolOf(store: Store, team: Team, seats: SeatInfo): Promise<string[]> {
  const keys = [userKey(team.ownerId)]
  for (const userId of seats.holders) {
    if (userId === team.ownerId) continue
    if (!(await store.getActiveSubscription(userId))) keys.push(userKey(userId))
  }
  return keys
}

/** По какому тарифу работает человек и с кем делит одновременные сессии. */
export async function planAccess(userId: string, storeArg?: Store): Promise<PlanAccess> {
  const store = storeArg ?? (await getStore())
  const [own, found] = await Promise.all([store.getActiveSubscription(userId), store.findTeamOfUser(userId)])

  if (own) {
    const plan = getPlan(own.plan)
    const poolKeys =
      found?.member.role === 'owner' ? await poolOf(store, found.team, await teamSeats(store, found.team)) : [userKey(userId)]
    return { plan, subscription: own, viaTeam: null, poolKeys, concurrentLimit: own.concurrentSessions ?? plan.concurrentSessions }
  }

  if (found && found.member.seat && seatRoles.has(found.member.role)) {
    const seats = await teamSeats(store, found.team)
    if (seats.ownerSubscription && seats.holders.includes(userId)) {
      const subscription = seats.ownerSubscription
      const plan = getPlan(subscription.plan)
      return {
        plan,
        subscription,
        viaTeam: { teamId: found.team.id, teamName: found.team.name, ownerId: found.team.ownerId },
        poolKeys: await poolOf(store, found.team, seats),
        concurrentLimit: subscription.concurrentSessions ?? plan.concurrentSessions,
      }
    }
  }

  const free = getPlan('free')
  return { plan: free, subscription: null, viaTeam: null, poolKeys: [userKey(userId)], concurrentLimit: free.concurrentSessions }
}
