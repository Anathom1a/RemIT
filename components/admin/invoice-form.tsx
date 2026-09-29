'use client'

import { useState } from 'react'
import { JsonForm } from '@/components/cabinet/json-form'
import { PLANS, getPlan } from '@/lib/plans'

const field =
  'h-9 rounded-lg border border-white/10 bg-ink-850/70 px-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

/**
 * Счёт организации от отдела продаж: любой платный тариф, в том числе
 * корпоративный с договорной суммой и лимитом сессий. Реквизиты берутся из
 * профиля пользователя.
 */
export function AdminInvoiceForm() {
  const plans = PLANS.filter((plan) => plan.priceMonthly > 0 || plan.negotiable)
  const [plan, setPlan] = useState(plans[0]?.id ?? 'pro')
  const negotiable = Boolean(getPlan(plan).negotiable)

  return (
    <JsonForm endpoint="/api/v1/admin/payments" body={{ action: 'invoice' }} submitLabel="Выставить счёт" reset className="flex flex-wrap items-center gap-2">
      <input name="email" type="email" required placeholder="Почта пользователя" className={`${field} w-56`} />
      <select name="plan" value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)} className={field}>
        {plans.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select name="months" defaultValue="12" className={field}>
        {[1, 3, 6, 12, 24, 36].map((months) => (
          <option key={months} value={months}>
            {months} мес.
          </option>
        ))}
      </select>
      <input
        name="amount"
        inputMode="decimal"
        required={negotiable}
        placeholder={negotiable ? 'Сумма, ₽' : 'Сумма, ₽ (по тарифу)'}
        className={`${field} w-40`}
      />
      {negotiable && (
        <input
          name="concurrentSessions"
          inputMode="numeric"
          required
          defaultValue={String(getPlan('corporate').concurrentSessions)}
          placeholder="Сессий"
          className={`${field} w-24`}
          title="Одновременных сессий"
        />
      )}
    </JsonForm>
  )
}
