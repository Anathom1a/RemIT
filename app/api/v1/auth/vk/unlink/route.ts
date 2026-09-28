import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'
import { VK_PROVIDER } from '@/lib/vk'

export const dynamic = 'force-dynamic'

/** Отвязка VK ID. Без пароля не даём — иначе в аккаунт будет не войти. */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!user.passwordHash) {
    return NextResponse.json(
      { error: 'Сначала задайте пароль: «Забыли пароль» на странице входа пришлёт ссылку на почту.' },
      { status: 400 },
    )
  }
  const store = await getStore()
  await store.deleteOAuthIdentity(VK_PROVIDER, user.id)
  return NextResponse.json({ ok: true })
}
