import { NextResponse } from 'next/server'
import { bindLoginDevice, issueClientToken, userPayload } from '@/lib/client-api'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Клиент опрашивает, завершён ли вход через VK ID: ?code=<state>&id&uuid.
 * Пока человек в браузере, отвечаем «No authed oidc is found» — клиент
 * понимает это как «ждём» и спрашивает снова.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code') ?? ''
  const store = await getStore()
  const state = code ? await store.findOAuthState(code) : null
  if (!state || state.action !== 'client' || state.expiresAt <= new Date().toISOString()) {
    return NextResponse.json({ error: 'Время входа истекло, попробуйте ещё раз' })
  }
  if (state.device && url.searchParams.get('id') !== state.device.id) {
    return NextResponse.json({ error: 'Вход начат на другом устройстве' })
  }
  if (state.error) {
    await store.deleteOAuthState(state.state)
    return NextResponse.json({ error: state.error })
  }
  if (!state.userId) {
    return NextResponse.json({ message: 'Ждём входа в браузере', error: 'No authed oidc is found' })
  }

  const user = await store.findUserById(state.userId)
  await store.deleteOAuthState(state.state)
  if (!user || user.status !== 'active') return NextResponse.json({ error: 'Аккаунт не найден или заблокирован' })

  const device = state.device ?? { id: '', uuid: '', name: '', os: '', type: '' }
  const token = await issueClientToken(user, { deviceId: device.id, uuid: device.uuid, deviceName: device.name, os: device.os }, request)
  await bindLoginDevice(request, user.id, device.id, { name: device.name, os: device.os, type: device.type }).catch((error) =>
    console.error('[oidc] привязка устройства:', error),
  )
  return NextResponse.json({ access_token: token, type: 'access_token', user: userPayload(user) })
}
