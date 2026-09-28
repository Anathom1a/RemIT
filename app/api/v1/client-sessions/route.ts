import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Входы в клиенте RemIT из кабинета: выйти на одном устройстве
 * (action: revoke, token — хеш входа) или на всех (action: revoke-all).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const store = await getStore()
  const now = new Date().toISOString()

  if (body.action === 'revoke-all') {
    const count = await store.revokeUserClientTokens(user.id, now)
    return NextResponse.json({ ok: true, count })
  }
  if (body.action === 'revoke') {
    const token = await store.findClientToken(String(body.token ?? ''))
    if (!token || token.userId !== user.id) return NextResponse.json({ error: 'Вход не найден' }, { status: 404 })
    await store.revokeClientToken(token.tokenHash, now)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
}
