'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

const field =
  'h-9 rounded-lg border border-white/10 bg-ink-850/70 px-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

/** Новый промокод: размер скидки, тарифы, сроки, лимиты. */
export function PromoForm({ plans }: { plans: { id: string; name: string }[] }) {
  const router = useRouter()
  const [form, setForm] = useState({
    code: '',
    kind: 'percent',
    value: '',
    maxUses: '',
    validUntil: '',
    note: '',
    firstPaymentOnly: false,
  })
  const [selectedPlans, setSelectedPlans] = useState<string[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: event.target.value })
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const response = await fetch('/api/v1/admin/promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', ...form, plans: selectedPlans, months }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось создать промокод')
      return
    }
    setForm({ ...form, code: '', value: '', note: '' })
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={form.code} onChange={set('code')} required placeholder="Код, например SPRING25" className={`${field} w-56 uppercase placeholder:normal-case`} />
        <select value={form.kind} onChange={set('kind')} className={field}>
          <option value="percent">Скидка, %</option>
          <option value="fixed">Скидка, ₽</option>
        </select>
        <input value={form.value} onChange={set('value')} required inputMode="decimal" placeholder={form.kind === 'percent' ? '20' : '500'} className={`${field} w-24`} />
        <input value={form.maxUses} onChange={set('maxUses')} inputMode="numeric" placeholder="Всего применений" className={`${field} w-40`} />
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          действует до
          <input type="date" value={form.validUntil} onChange={set('validUntil')} className={field} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
        <span className="text-text-muted">Тарифы (пусто — любые):</span>
        {plans.map((plan) => (
          <label key={plan.id} className="flex items-center gap-1.5">
            <input type="checkbox" checked={selectedPlans.includes(plan.id)} onChange={() => setSelectedPlans(toggle(selectedPlans, plan.id))} className="accent-brand-500" />
            {plan.name}
          </label>
        ))}
        <span className="text-text-muted">Срок:</span>
        {[
          ['1', 'месяц'],
          ['12', 'год'],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-1.5">
            <input type="checkbox" checked={months.includes(value)} onChange={() => setMonths(toggle(months, value))} className="accent-brand-500" />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={form.firstPaymentOnly}
            onChange={(event) => setForm({ ...form, firstPaymentOnly: event.target.checked })}
            className="accent-brand-500"
          />
          только первая оплата
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={form.note} onChange={set('note')} placeholder="Заметка: для кого, откуда" className={`${field} w-80`} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Создаём…' : 'Создать промокод'}
        </Button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  )
}
