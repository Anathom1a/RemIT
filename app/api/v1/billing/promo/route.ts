import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { CheckoutError } from '@/lib/billing-model'
import { checkPromo, describePromo, termsOf } from '@/lib/promo'
import { consumeLimit, tooManyAttempts } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** Проверка промокода в кабинете: условия, чтобы показать цены со скидкой. */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Перебор кодов: 20 попыток за 15 минут на аккаунт.
  const limit = consumeLimit(`promo:${user.id}`, 20, 15 * 60 * 1000)
  if (!limit.allowed) {
    const { body, headers } = tooManyAttempts(limit.retryAfter)
    return NextResponse.json(body, { status: 429, headers })
  }
  try {
    const promo = await checkPromo(user, new URL(request.url).searchParams.get('code'))
    return NextResponse.json({ ok: true, terms: termsOf(promo), description: describePromo(promo) })
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}
