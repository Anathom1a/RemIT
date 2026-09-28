import { NextResponse } from 'next/server'
import { checkCredentials, clearLoginFailures, loginBlocked, recordLoginFailure } from '@/lib/login-guard'
import { ensurePanelAccount, panelLinkEnabled, rotatePanelPassword, type PanelCredentials } from '@/lib/panel'
import { touchDevice } from '@/lib/quota'
import { getStore } from '@/lib/store'
import { proxyToRustdeskApi } from '@/lib/upstream'

export const dynamic = 'force-dynamic'

const UNAVAILABLE = 'Вход временно недоступен. Попробуйте через несколько минут.'

/**
 * Вход в клиенте RemIT (кнопка «Войти»). Единый аккаунт с сайтом.
 *
 * - Почта и пароль от личного кабинета: сайт входит в панель от имени
 *   связанного пользователя (при первом входе заводит его) и отдаёт клиенту
 *   токен панели. Устройство, с которого вошли, привязывается к аккаунту.
 * - Всё остальное — прежние аккаунты панели — уходит в панель как есть:
 *   те, кто пользовался клиентом до сайта, входят как раньше.
 *
 * Ответ неверного пароля один и тот же — его даёт панель, — поэтому по нему
 * не понять, есть ли такая почта на сайте.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  let payload: Record<string, any> | null = null
  try {
    const parsed = raw ? JSON.parse(raw) : null
    payload = parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    payload = null
  }
  const login = String(payload?.username ?? '').trim()
  const password = String(payload?.password ?? '')

  if (!payload || !login || !panelLinkEnabled()) return passthrough(request, raw)

  const store = await getStore()
  if (!login.includes('@')) {
    // Прежний логин, который человек уже перенёс в аккаунт сайта: пароль от
    // него больше не действует, подсказываем, чем входить.
    const linked = await store.findPanelAccountByUsername(login)
    if (linked?.origin === 'linked') {
      return NextResponse.json(
        { error: 'Этот аккаунт перенесён в аккаунт RemIT. Войдите почтой и паролем от личного кабинета.' },
        { status: 400 },
      )
    }
    return passthrough(request, raw)
  }

  const blocked = loginBlocked(request, login)
  if (blocked) return NextResponse.json(blocked.body, { status: 429, headers: blocked.headers })

  const { user, valid } = await checkCredentials(login, password)
  if (!user || !valid) {
    if (user) recordLoginFailure(request, login)
    // Может быть прежний аккаунт панели с почтой вместо логина — пусть решает панель.
    const response = await passthrough(request, raw)
    if (user && response.status === 200) clearLoginFailures(login)
    return response
  }
  clearLoginFailures(login)

  let credentials: PanelCredentials
  try {
    credentials = await ensurePanelAccount(user)
  } catch (error) {
    console.error('[login] не удалось завести пользователя в панели:', error)
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }

  let upstream = await loginToPanel(request, payload, credentials)
  if (upstream.status !== 502 && !upstream.json?.access_token) {
    // Пароль в панели могли сменить вручную в /_admin/ — ставим свой и пробуем ещё раз.
    try {
      const rotated = await rotatePanelPassword(user.id)
      if (rotated) upstream = await loginToPanel(request, payload, rotated)
    } catch (error) {
      console.error('[login] не удалось обновить пароль в панели:', error)
    }
  }
  if (upstream.status === 502) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  if (!upstream.json?.access_token) {
    console.error('[login] панель отказала связанному пользователю', credentials.account.panelUsername, upstream.text)
    return NextResponse.json(upstream.json ?? { error: UNAVAILABLE }, { status: upstream.status === 200 ? 503 : upstream.status })
  }

  await bindDevice(request, user.id, payload).catch((error) => console.error('[login] привязка устройства:', error))
  return NextResponse.json(upstream.json, { status: 200 })
}

async function passthrough(request: Request, raw: string) {
  const upstream = await proxyToRustdeskApi('/api/login', request, raw)
  if (upstream.status === 502 && !upstream.json) {
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }
  return new NextResponse(upstream.text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function loginToPanel(request: Request, payload: Record<string, any>, credentials: PanelCredentials) {
  const body = JSON.stringify({
    ...payload,
    username: credentials.account.panelUsername,
    password: credentials.password,
  })
  return proxyToRustdeskApi('/api/login', request, body)
}

/**
 * Устройство, с которого вошли в клиент, записываем на аккаунт — так на нём
 * сразу действует тариф. Уже привязанное к кому-то другому не трогаем.
 * Вход из веб-клиента устройства не даёт.
 */
async function bindDevice(request: Request, userId: string, payload: Record<string, any>): Promise<void> {
  const rustdeskId = String(payload.id ?? '').trim()
  const info = (payload.deviceInfo ?? {}) as Record<string, unknown>
  if (!rustdeskId || request.headers.get('referer') || info.type === 'browser') return
  if (!/^[0-9A-Za-z_-]{3,64}$/.test(rustdeskId)) return

  const store = await getStore()
  const patch: { name?: string; os?: string } = {}
  if (typeof info.name === 'string' && info.name) patch.name = info.name.slice(0, 100)
  if (typeof info.os === 'string' && info.os) patch.os = info.os.slice(0, 100)
  const device = await touchDevice(store, rustdeskId, patch)
  if (device && !device.userId) await store.setDeviceOwner(rustdeskId, userId)
}
