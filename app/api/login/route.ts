import { NextResponse } from 'next/server'
import { BLOCKED_MESSAGE } from '@/lib/accounts'
import { WEBCLIENT_PAID_ONLY, hasWebClient, isWebClientLogin } from '@/lib/webclient'
import { bindLoginDevice, issueClientToken, readJson, userPayload } from '@/lib/client-api'
import { checkCredentials, clearLoginFailures, loginBlocked, recordLoginFailure } from '@/lib/login-guard'

export const dynamic = 'force-dynamic'

/**
 * Вход в клиенте RemIT (кнопка «Войти»): почта и пароль от личного кабинета.
 * Счётчик неудачных попыток общий со страницей входа на сайте.
 *
 * Тело — как у клиента RustDesk: `{username, password, id, uuid, autoLogin,
 * type, deviceInfo: {name, os, type}}`.
 */
export async function POST(request: Request) {
  const payload = (await readJson<Record<string, any>>(request)) ?? {}
  const email = String(payload.username ?? '').trim()
  const password = String(payload.password ?? '')
  if (!email || !password) return NextResponse.json({ error: 'Введите почту и пароль' }, { status: 400 })

  const blocked = loginBlocked(request, email)
  if (blocked) return NextResponse.json(blocked.body, { status: 429, headers: blocked.headers })

  const { user, valid, blocked: isBlocked } = await checkCredentials(email, password)
  if (isBlocked) return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 400 })
  if (!user || !valid) {
    recordLoginFailure(request, email)
    return NextResponse.json({ error: 'Неверная почта или пароль' }, { status: 400 })
  }
  clearLoginFailures(email)

  // Вход из веб-клиента (браузер) — только на платном тарифе.
  if (isWebClientLogin(request, payload) && !(await hasWebClient(user.id))) {
    return NextResponse.json({ error: WEBCLIENT_PAID_ONLY }, { status: 403 })
  }

  const info = (payload.deviceInfo ?? {}) as Record<string, unknown>
  const deviceId = String(payload.id ?? '').trim()
  const token = await issueClientToken(
    user,
    {
      deviceId,
      uuid: String(payload.uuid ?? ''),
      deviceName: typeof info.name === 'string' ? info.name : '',
      os: typeof info.os === 'string' ? info.os : '',
    },
    request,
  )

  await bindLoginDevice(request, user.id, deviceId, info).catch((error) => console.error('[login] привязка устройства:', error))

  return NextResponse.json({ access_token: token, type: 'access_token', user: userPayload(user) })
}
