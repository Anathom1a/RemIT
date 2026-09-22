import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getStore } from '@/lib/store'
import { getPlan } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** Список пользователей с их тарифом: поиск по почте и имени. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '25', 10) || 25))
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0)

  const store = await getStore()
  const { users, total } = await store.listUsers({
    query: url.searchParams.get('q') ?? undefined,
    limit,
    offset,
  })

  const rows = await Promise.all(
    users.map(async (user) => {
      const subscription = await store.getActiveSubscription(user.id)
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        plan: subscription ? getPlan(subscription.plan).id : 'free',
        planName: subscription ? getPlan(subscription.plan).name : 'Бесплатный',
        expiresAt: subscription?.expiresAt ?? null,
      }
    }),
  )

  return NextResponse.json({ users: rows, total, limit, offset })
}

/** Смена роли: выдать или снять права администратора. */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const userId = String(payload.userId ?? '')
  const role = String(payload.role ?? '')

  if (role !== 'admin' && role !== 'user') {
    return NextResponse.json({ error: 'Роль должна быть admin или user' }, { status: 400 })
  }

  const store = await getStore()
  const user = await store.findUserById(userId)
  if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

  await store.updateUser({ ...user, role })
  return NextResponse.json({ ok: true, role })
}
