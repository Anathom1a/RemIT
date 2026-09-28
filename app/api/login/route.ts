import { NextResponse } from 'next/server'
import { issueClientToken, readJson, userPayload } from '@/lib/client-api'
import { checkCredentials, clearLoginFailures, loginBlocked, recordLoginFailure } from '@/lib/login-guard'
import { touchDevice } from '@/lib/quota'
import { getStore } from '@/lib/store'

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

  const { user, valid } = await checkCredentials(email, password)
  if (!user || !valid) {
    recordLoginFailure(request, email)
    return NextResponse.json({ error: 'Неверная почта или пароль' }, { status: 400 })
  }
  clearLoginFailures(email)

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

  await bindDevice(request, user.id, deviceId, info).catch((error) => console.error('[login] привязка устройства:', error))

  return NextResponse.json({ access_token: token, type: 'access_token', user: userPayload(user) })
}

/**
 * Компьютер, с которого вошли, записываем на аккаунт — на нём сразу
 * действует тариф. Уже привязанный к другому аккаунту не трогаем. Вход из
 * браузера устройства не даёт.
 */
async function bindDevice(request: Request, userId: string, rustdeskId: string, info: Record<string, unknown>) {
  if (!rustdeskId || request.headers.get('referer') || info.type === 'browser') return
  if (!/^[0-9A-Za-z_-]{3,64}$/.test(rustdeskId)) return

  const store = await getStore()
  const patch: { name?: string; os?: string } = {}
  if (typeof info.name === 'string' && info.name) patch.name = info.name.slice(0, 100)
  if (typeof info.os === 'string' && info.os) patch.os = info.os.slice(0, 100)
  const device = await touchDevice(store, rustdeskId, patch)
  if (device && !device.userId) await store.setDeviceOwner(rustdeskId, userId)
}
