import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getStore } from '@/lib/store'
import { getPlan } from '@/lib/plans'
import { RESET_TTL_MS, createResetLink } from '@/lib/password-reset'
import { AccountError, deleteAccount, setBlocked } from '@/lib/accounts'
import { getCurrentUser } from '@/lib/auth'

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

/**
 * Смена роли: выдать или снять права администратора.
 * С action: "reset-link" — ссылка для сброса пароля, чтобы передать её
 * человеку, если письмо не дошло или почта ещё не настроена.
 * С action: "revoke-client" — выход из клиента (token — один вход, иначе все).
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const userId = String(payload.userId ?? '')

  if (payload.action === 'reset-link') {
    const store = await getStore()
    const user = await store.findUserById(userId)
    if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    const link = await createResetLink(user.id)
    return NextResponse.json({ ok: true, link, expiresInMinutes: RESET_TTL_MS / 60000 })
  }

  // Блокировка, разблокировка и удаление аккаунта.
  if (payload.action === 'block' || payload.action === 'unblock' || payload.action === 'delete') {
    const admin = await getCurrentUser()
    if (admin && admin.id === userId) {
      return NextResponse.json({ error: 'Нельзя заблокировать или удалить собственный аккаунт' }, { status: 400 })
    }
    try {
      if (payload.action === 'delete') await deleteAccount(userId)
      else await setBlocked(userId, payload.action === 'block')
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: error.status })
      throw error
    }
  }

  // Выход из клиента: один вход (token — хеш) или все входы пользователя.
  if (payload.action === 'revoke-client') {
    const store = await getStore()
    const now = new Date().toISOString()
    if (payload.token) {
      const token = await store.findClientToken(String(payload.token))
      if (!token) return NextResponse.json({ error: 'Вход не найден' }, { status: 404 })
      await store.revokeClientToken(token.tokenHash, now)
      return NextResponse.json({ ok: true, count: 1 })
    }
    const user = await store.findUserById(userId)
    if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    return NextResponse.json({ ok: true, count: await store.revokeUserClientTokens(user.id, now) })
  }

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
