import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { hasWebClient, shareIsUsable } from '@/lib/webclient'
import { webclientPage } from '@/lib/webclient-page'

export const dynamic = 'force-dynamic'

function page(shareToken?: string): Response {
  return new Response(webclientPage(shareToken), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  })
}

/**
 * Страница веб-клиента. Открывается:
 *   - по гостевой ссылке (?share=...) — пока ссылка жива и у владельца платный тариф;
 *   - вошедшему на сайте с платным тарифом.
 * Остальных отправляем на вход или к выбору тарифа.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const share = url.searchParams.get('share') ?? ''
  if (share) {
    if (await shareIsUsable(share)) return page(share)
    return NextResponse.redirect(new URL('/webclient/ssylka-ne-deystvuet', url), 303)
  }

  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/vhod', url), 303)
  if (!(await hasWebClient(user.id))) return NextResponse.redirect(new URL('/kabinet/veb-klient', url), 303)
  return page()
}
