'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { usePromo } from './promo'

const field =
  'h-10 rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm text-text-primary focus:border-brand-500 focus:outline-none'

/** Счёт на оплату для организации: тариф и срок, дальше — страница счёта. */
export function InvoiceForm({
  plans,
  defaultPlan,
}: {
  plans: { id: string; name: string; priceMonthly: string; priceYearly: string }[]
  defaultPlan?: string
}) {
  const router = useRouter()
  const promo = usePromo()
  const [plan, setPlan] = useState(defaultPlan ?? plans[0]?.id ?? '')
  const [months, setMonths] = useState(12)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const response = await fetch('/api/v1/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, months, method: 'invoice', ...(promo ? { promoCode: promo.code } : {}) }),
    })
    const data = (await response.json().catch(() => ({}))) as { redirectUrl?: string; error?: string }
    setPending(false)
    if (!response.ok || !data.redirectUrl) {
      setError(data.error ?? 'Не удалось выставить счёт')
      return
    }
    router.push(data.redirectUrl)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <select value={plan} onChange={(event) => setPlan(event.target.value)} className={field} aria-label="Тариф">
        {plans.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} — {item.priceMonthly}/мес, {item.priceYearly}/год
          </option>
        ))}
      </select>
      <select value={months} onChange={(event) => setMonths(Number(event.target.value))} className={field} aria-label="Срок">
        <option value={1}>1 месяц</option>
        <option value={3}>3 месяца</option>
        <option value={6}>6 месяцев</option>
        <option value={12}>1 год</option>
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Выставляем…' : promo ? `Выставить счёт с промокодом ${promo.code}` : 'Выставить счёт'}
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  )
}
