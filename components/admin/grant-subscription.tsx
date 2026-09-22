'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PLANS, getPlan, isPaidPlan } from '@/lib/plans'

/** Выдача подписки вручную: оплата по счёту, компенсация, тестовый доступ. */
export function GrantSubscription({ userId }: { userId: string }) {
  const router = useRouter()
  const paidPlans = PLANS.filter((plan) => plan.priceMonthly > 0)
  const [plan, setPlan] = useState(paidPlans[0]?.id ?? 'pro')
  const [months, setMonths] = useState(1)
  const [concurrent, setConcurrent] = useState(String(getPlan('corporate').concurrentSessions))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  // Число сессий спрашиваем только у договорного тарифа: у остальных оно в тарифе.
  const isNegotiable = Boolean(getPlan(plan).negotiable)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const response = await fetch('/api/v1/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'grant',
        userId,
        plan,
        months,
        concurrent: isNegotiable ? concurrent : undefined,
      }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось выдать подписку')
      return
    }
    router.refresh()
  }

  const field =
    'h-9 rounded-lg border border-white/10 bg-ink-850/70 px-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none'

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <select value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)} className={field}>
        {paidPlans.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        value={months}
        onChange={(event) => setMonths(Number(event.target.value))}
        className={field}
      >
        {[1, 3, 6, 12].map((value) => (
          <option key={value} value={value}>
            {value} мес.
          </option>
        ))}
      </select>
      {isNegotiable && (
        <label className="flex items-center gap-2 text-sm text-text-muted">
          сессий
          <input
            value={concurrent}
            onChange={(event) => setConcurrent(event.target.value)}
            inputMode="numeric"
            className={`${field} w-20`}
          />
        </label>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Выдаём…' : 'Выдать'}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  )
}
