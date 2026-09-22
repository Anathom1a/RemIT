'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PLANS, getPlan, isPaidPlan } from '@/lib/plans'

const field =
  'h-9 rounded-lg border border-white/10 bg-ink-850/70 px-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none'

/**
 * Выдача пробного периода: тариф, срок и число сессий для корпоративного.
 * Работает в двух местах — по заявке с сайта и напрямую в карточке
 * пользователя. Самостоятельной активации у клиента нет: пробу включает
 * только администратор.
 */
export function TrialGrant({
  leadId,
  userId,
  defaultPlan,
  defaultDays,
  maxDays,
  hasAccount = true,
}: {
  leadId?: string
  userId?: string
  defaultPlan: string
  defaultDays: number
  maxDays: number
  hasAccount?: boolean
}) {
  const router = useRouter()
  const paid = PLANS.filter((item) => isPaidPlan(item.id))
  const [plan, setPlan] = useState(defaultPlan)
  const [days, setDays] = useState(defaultDays)
  const [concurrent, setConcurrent] = useState(String(getPlan('corporate').concurrentSessions))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const isNegotiable = Boolean(getPlan(plan).negotiable)

  async function grant() {
    setPending(true)
    setError('')

    const response = leadId
      ? await fetch('/api/v1/admin/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: leadId,
            action: 'trial',
            plan,
            days,
            concurrent: isNegotiable ? concurrent : undefined,
          }),
        })
      : await fetch('/api/v1/admin/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            action: 'trial',
            plan,
            days,
            concurrent: isNegotiable ? concurrent : undefined,
          }),
        })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось выдать пробный период')
      return
    }
    router.refresh()
  }

  const dayOptions = [7, 14, 21, 30].filter((value) => value <= maxDays)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={plan} onChange={(event) => setPlan(event.target.value)} className={field}>
        {paid.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select value={days} onChange={(event) => setDays(Number(event.target.value))} className={field}>
        {dayOptions.map((value) => (
          <option key={value} value={value}>
            {value} дней
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
      <Button size="sm" onClick={grant} disabled={pending}>
        {pending ? 'Выдаём…' : 'Выдать пробный период'}
      </Button>
      {!hasAccount && (
        <span className="text-xs text-warning">аккаунта с этой почтой ещё нет — попросите зарегистрироваться</span>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
