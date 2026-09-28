import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'
import { ShareError, createShare, revokeShare, shareUrl } from '@/lib/webclient'

export const dynamic = 'force-dynamic'

/** Гостевые ссылки веб-клиента: {action: "share", peerId, password, passwordType, ttl} и {action: "revoke", token}. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const store = await getStore()

  try {
    if (body.action === 'share') {
      const share = await createShare(user, {
        peerId: body.peerId,
        password: body.password,
        passwordType: body.passwordType,
        ttl: body.ttl,
      })
      return NextResponse.json({ ok: true, url: shareUrl(share.token) })
    }
    if (body.action === 'revoke') {
      const share = await store.findWebShare(String(body.token ?? ''))
      if (!share || share.userId !== user.id) return NextResponse.json({ error: 'Ссылка не найдена' }, { status: 404 })
      await revokeShare(share.token)
      return NextResponse.json({ ok: true })
    }
  } catch (error) {
    if (error instanceof ShareError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
}
