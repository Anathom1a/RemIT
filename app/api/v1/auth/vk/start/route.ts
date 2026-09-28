import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { VkError, beginVk } from '@/lib/vk'

export const dynamic = 'force-dynamic'

/** Кнопка «Войти через VK ID» (?action=login) и «Привязать VK ID» (?action=link). */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action') === 'link' ? 'link' : 'login'
  const back = action === 'link' ? '/kabinet/profil' : '/vhod'

  try {
    if (action === 'link') {
      const user = await getCurrentUser()
      if (!user) return NextResponse.redirect(new URL('/vhod', url), 303)
      const { url: target } = await beginVk({ action: 'site-link', userId: user.id, returnTo: '/kabinet/profil' })
      return NextResponse.redirect(target, 303)
    }
    const { url: target } = await beginVk({ action: 'site-login', returnTo: url.searchParams.get('returnTo') ?? '/kabinet' })
    return NextResponse.redirect(target, 303)
  } catch (error) {
    const message = error instanceof VkError ? error.message : 'Вход через VK ID временно недоступен'
    return NextResponse.redirect(new URL(`${back}?vk_error=${encodeURIComponent(message)}`, url), 303)
  }
}
