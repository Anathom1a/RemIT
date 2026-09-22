'use client'

import { useState } from 'react'
import { PLANS, formatPrice } from '@/lib/plans'
import { ButtonLink } from '@/components/ui/button'

/**
 * Калькулятор экономии. Считает по цифрам, которые пользователь вводит сам:
 * чужие прайсы меняются, а собственный счёт клиент знает точно.
 */
export function SavingsCalculator() {
  const [seats, setSeats] = useState(5)
  const [pricePerSeat, setPricePerSeat] = useState(1500)

  const paid = PLANS.filter((plan) => plan.priceMonthly > 0)
  const current = Math.max(0, seats) * Math.max(0, pricePerSeat) * 100

  // Подбираем тариф по числу одновременных сессий: обычно это и есть «места».
  const suggested = paid.find((plan) => plan.concurrentSessions >= seats) ?? paid[paid.length - 1]
  const ours = suggested.priceMonthly
  const diffMonth = current - ours
  const diffYear = diffMonth * 12

  const field =
    'h-11 w-full rounded-xl border border-white/10 bg-ink-850/70 px-3.5 text-[0.95rem] text-text-primary focus:border-brand-500 focus:outline-none'

  return (
    <div className="card p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Сколько специалистов подключается</span>
          <input
            value={seats || ''}
            onChange={(event) => setSeats(Number.parseInt(event.target.value, 10) || 0)}
            inputMode="numeric"
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Сколько платите сейчас за место, ₽ в месяц</span>
          <input
            value={pricePerSeat || ''}
            onChange={(event) => setPricePerSeat(Number.parseInt(event.target.value, 10) || 0)}
            inputMode="numeric"
            className={field}
          />
        </label>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-5">
          <p className="text-sm text-text-muted">Сейчас</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatPrice(current)}</p>
          <p className="mt-1 text-xs text-text-muted">в месяц</p>
        </div>
        <div className="rounded-2xl border border-brand-500/40 bg-brand-500/8 p-5">
          <p className="text-sm text-text-muted">RemIT, тариф «{suggested.name}»</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-brand-400">{formatPrice(ours)}</p>
          <p className="mt-1 text-xs text-text-muted">
            в месяц · до {suggested.concurrentSessions} одновременных сессий
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-5">
          <p className="text-sm text-text-muted">{diffYear >= 0 ? 'Экономия за год' : 'Разница за год'}</p>
          <p
            className={`mt-2 text-2xl font-semibold tabular-nums ${diffYear >= 0 ? 'text-success' : 'text-text-primary'}`}
          >
            {diffYear >= 0 ? formatPrice(diffYear) : formatPrice(Math.abs(diffYear))}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {diffYear >= 0 ? 'при тех же задачах' : 'наш тариф дороже при таких вводных'}
          </p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-text-muted">
        Расчёт приблизительный: считаем по вашей текущей цене за место и нашему тарифу с подходящим числом
        одновременных сессий. Годовая оплата у нас дешевле помесячной ещё примерно на 17%.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/probnyy-period">Проверить на пробном периоде</ButtonLink>
        <ButtonLink href="/tarify" variant="secondary">
          Посмотреть тарифы
        </ButtonLink>
      </div>
    </div>
  )
}
