'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

const field = `h-9 rounded-lg border border-white/10 bg-ink-850/70 px-2 text-sm text-text-primary
  focus:border-brand-500 focus:outline-none`

/** Возврат по платежу: сумма (по умолчанию — всё, что ещё не вернули), причина, отключить ли подписку. */
export function RefundForm({ paymentId, remaining, viaProvider }: { paymentId: string; remaining: number; viaProvider: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState((remaining / 100).toFixed(2))
  const [reason, setReason] = useState('')
  const [cancel, setCancel] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Вернуть
      </Button>
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = viaProvider
      ? `Вернуть ${amount} ₽ через ЮKassa? Деньги уйдут покупателю, отменить возврат нельзя.`
      : `Отметить возврат ${amount} ₽? Сами деньги верните переводом.`
    if (!window.confirm(text)) return
    setPending(true)
    setError('')
    const response = await fetch('/api/v1/admin/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, action: 'refund', amount, reason, cancelSubscription: cancel }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось оформить возврат')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-wrap items-center gap-2">
      <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="Сумма, ₽" className={`${field} w-24`} />
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина" aria-label="Причина" className={`${field} min-w-0 flex-1`} />
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input type="checkbox" checked={cancel} onChange={(event) => setCancel(event.target.checked)} className="accent-brand-500" />
        отключить подписку
      </label>
      <Button type="submit" size="sm" variant="danger" disabled={pending}>
        {pending ? '…' : viaProvider ? 'Вернуть' : 'Отметить возврат'}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
        Отмена
      </Button>
      {error && <span className="w-full text-xs text-danger">{error}</span>}
    </form>
  )
}
