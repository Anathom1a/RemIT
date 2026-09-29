'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatPrice, type PlanId } from '@/lib/plans'
import { useAutoRenew } from './autopay'
import { usePromo, usePromoPrice } from './promo'

/**
 * Кнопка оплаты: создаёт заказ и уводит на страницу платёжного провайдера.
 * С upgrade — доплата за переход на старший тариф до конца текущей подписки.
 * С price — подпись «label — цена», и цена учитывает промокод.
 */
export function CheckoutButton({
  plan,
  months = 1,
  label,
  price,
  variant = 'primary',
  upgrade = false,
}: {
  plan: PlanId
  months?: number
  label: string
  price?: number
  variant?: 'primary' | 'secondary'
  upgrade?: boolean
}) {
  const router = useRouter()
  const autoRenew = useAutoRenew()
  const promo = usePromo()
  const discounted = usePromoPrice(plan, months, price ?? 0)
  const withPromo = !upgrade && price !== undefined && discounted !== null
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setPending(true)
    setError('')

    const response = await fetch(upgrade ? '/api/v1/billing/upgrade' : '/api/v1/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        upgrade ? { plan } : { plan, months, autoRenew, ...(withPromo && promo ? { promoCode: promo.code } : {}) },
      ),
    })
    const data = (await response.json().catch(() => ({}))) as { redirectUrl?: string; error?: string }

    setPending(false)
    if (!response.ok || !data.redirectUrl) {
      setError(data.error ?? 'Не удалось создать платёж')
      return
    }

    if (data.redirectUrl.startsWith('http')) {
      window.location.href = data.redirectUrl
    } else {
      router.push(data.redirectUrl)
      router.refresh()
    }
  }

  return (
    <div className="w-full">
      <Button variant={variant} onClick={handleClick} disabled={pending} className="w-full">
        {pending ? (
          'Создаём счёт…'
        ) : price === undefined ? (
          label
        ) : withPromo ? (
          <>
            {label} — <s className="opacity-60">{formatPrice(price)}</s>&nbsp;
            {discounted === 0 ? 'бесплатно' : formatPrice(discounted)}
          </>
        ) : (
          `${label} — ${formatPrice(price)}`
        )}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
