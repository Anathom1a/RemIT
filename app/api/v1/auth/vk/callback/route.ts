import { NextResponse } from 'next/server'
import { createUserSession, sessionCookieOptions } from '@/lib/auth'
import { config } from '@/lib/config'
import { getStore } from '@/lib/store'
import { VkError, VkLoginError, accountForVk, exchangeVk, linkVk } from '@/lib/vk'

export const dynamic = 'force-dynamic'

/** Страница для браузера, открытого из клиента: вход завершён или нет. */
function clientPage(ok: boolean, text: string): Response {
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${config.brand.name} — вход через VK ID</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1220;color:#e2e8f0;font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 12px;color:${ok ? '#4ade80' : '#f87171'}}</style></head>
<body><main><h1>${ok ? 'Вход выполнен' : 'Не получилось войти'}</h1><p>${text.replace(/[<>&]/g, '')}</p></main></body></html>`
  return new Response(html, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

/** Возврат с id.vk.com: ?code, ?state, ?device_id (или ?error). */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const stateKey = url.searchParams.get('state') ?? ''
  const store = await getStore()
  const state = stateKey ? await store.findOAuthState(stateKey) : null
  const now = new Date().toISOString()

  if (!state || state.expiresAt <= now) {
    return NextResponse.redirect(new URL(`/vhod?vk_error=${encodeURIComponent('Время входа истекло, попробуйте ещё раз')}`, url), 303)
  }

  const fail = async (message: string) => {
    if (state.action === 'client') {
      await store.saveOAuthState({ ...state, error: message })
      return clientPage(false, message)
    }
    await store.deleteOAuthState(state.state)
    const back = state.action === 'site-link' ? '/kabinet/profil' : '/vhod'
    return NextResponse.redirect(new URL(`${back}?vk_error=${encodeURIComponent(message)}`, url), 303)
  }

  const code = url.searchParams.get('code') ?? ''
  if (!code) return fail(url.searchParams.get('error_description') || 'Вход через VK ID отменён')

  try {
    const profile = await exchangeVk(state, code, url.searchParams.get('device_id') ?? '')

    if (state.action === 'site-link') {
      await linkVk(state.userId ?? '', profile)
      await store.deleteOAuthState(state.state)
      return NextResponse.redirect(new URL('/kabinet/profil?vk=linked', url), 303)
    }

    const user = await accountForVk(profile)
    if (state.action === 'client') {
      // Клиент заберёт результат через /api/oidc/auth-query.
      await store.saveOAuthState({ ...state, userId: user.id })
      return clientPage(true, `Вы вошли как ${user.email}. Вернитесь в приложение ${config.brand.name}.`)
    }

    await store.deleteOAuthState(state.state)
    const token = await createUserSession(user.id)
    const response = NextResponse.redirect(new URL(state.returnTo, url), 303)
    response.cookies.set({ ...sessionCookieOptions(), value: token })
    return response
  } catch (error) {
    if (error instanceof VkError || error instanceof VkLoginError) return fail(error.message)
    console.error('[vk] вход не удался:', error)
    return fail('Вход через VK ID временно недоступен')
  }
}
