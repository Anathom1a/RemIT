import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { LinkError, linkExistingPanelAccount, panelLinkEnabled } from '@/lib/panel'
import { clientIp, consumeLimit, tooManyAttempts } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 15 * 60 * 1000

/**
 * Перенос прежнего аккаунта клиента в аккаунт сайта. Человек вводит логин и
 * пароль, которыми входил в клиент раньше; после переноса адресная книга
 * остаётся, а входить в клиент нужно почтой и паролем от кабинета.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!panelLinkEnabled()) return NextResponse.json({ error: 'Перенос сейчас недоступен' }, { status: 503 })

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const login = String(payload.login ?? '').trim()
  const password = String(payload.password ?? '')
  if (login.length < 2 || login.length > 32 || password.length < 4 || password.length > 32) {
    return NextResponse.json({ error: 'Неверный логин или пароль от клиента' }, { status: 400 })
  }

  for (const [key, limit] of [
    [`client-link:${user.id}`, 5],
    [`client-link-ip:${clientIp(request)}`, 20],
  ] as const) {
    const check = consumeLimit(key, limit, WINDOW_MS)
    if (!check.allowed) {
      const { body, headers } = tooManyAttempts(check.retryAfter)
      return NextResponse.json(body, { status: 429, headers })
    }
  }

  try {
    const account = await linkExistingPanelAccount(user, login, password, request.headers)
    return NextResponse.json({ ok: true, login: account.panelUsername })
  } catch (error) {
    if (error instanceof LinkError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[client-link]', error)
    return NextResponse.json({ error: 'Сервис входа временно недоступен. Попробуйте позже.' }, { status: 503 })
  }
}
