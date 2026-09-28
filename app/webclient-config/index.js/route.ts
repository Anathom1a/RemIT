import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/auth'
import { issueClientToken, userByClientToken } from '@/lib/client-api'
import { config } from '@/lib/config'
import { hasWebClient } from '@/lib/webclient'

export const dynamic = 'force-dynamic'

const TOKEN_COOKIE = 'remit_wc'

/**
 * Настройки веб-клиента: адрес API, сервер и ключ — записываем при каждой
 * загрузке, чтобы ничего не нужно было настраивать и нельзя было увести
 * клиент на чужой сервер.
 *
 * Подписчику сайт сразу входит в веб-клиент: токен кладём в localStorage.
 * С ним hbbs узнаёт аккаунт при подключении, а время пишется подписке.
 * Токен выдаём один раз и держим в cookie, чтобы не плодить входы.
 */
export async function GET(request: Request) {
  const values: Record<string, string> = {
    'api-server': config.rustdesk.apiServer,
    'wc-api-server': config.rustdesk.apiServer,
    'custom-rendezvous-server': config.rustdesk.idServer,
    key: config.rustdesk.publicKey,
  }

  let newToken: string | null = null
  const user = await getCurrentUser()
  if (user && (await hasWebClient(user.id))) {
    const jar = await cookies()
    const saved = jar.get(TOKEN_COOKIE)?.value ?? ''
    const owner = saved ? await userByClientToken(saved) : null
    const token =
      owner?.id === user.id
        ? saved
        : (newToken = await issueClientToken(user, { deviceId: 'web', uuid: '', deviceName: 'Веб-клиент', os: 'браузер' }, request))
    values.access_token = token
    values.user_info = JSON.stringify({ name: user.email, display_name: user.name || user.email, status: 1 })
  }

  const lines = Object.entries(values).map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
  lines.push('window.webclient_magic_queryonline = 0;', "window.ws_host = '';")
  const response = new Response(lines.join('\n') + '\n', {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' },
  })
  if (newToken) {
    const secure = config.auth.cookieSecure ? '; Secure' : ''
    response.headers.append(
      'set-cookie',
      `${TOKEN_COOKIE}=${newToken}; Path=/webclient-config; HttpOnly; SameSite=Lax; Max-Age=${config.client.tokenTtlSeconds}${secure}`,
    )
  }
  return response
}
