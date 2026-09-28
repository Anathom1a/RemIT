'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { PlanId } from '@/lib/plans'

/**
 * Кнопка оплаты: создаёт заказ и уводит на страницу платёжного провайдера.
 * С upgrade — доплата за переход на старший тариф до конца текущей подписки.
 */
export function CheckoutButton({
  plan,
  months = 1,
  label,
  variant = 'primary',
  upgrade = false,
}: {
  plan: PlanId
  months?: number
  label: string
  variant?: 'primary' | 'secondary'
  upgrade?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setPending(true)
    setError('')

    const response = await fetch(upgrade ? '/api/v1/billing/upgrade' : '/api/v1/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upgrade ? { plan } : { plan, months }),
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
        {pending ? 'Создаём счёт…' : label}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
