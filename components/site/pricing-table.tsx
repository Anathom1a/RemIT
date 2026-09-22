'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PLANS, formatPrice, getPlan } from '@/lib/plans'
import { buttonClass } from '@/components/ui/button'

/** Витрина тарифов с переключателем «месяц / год». Год — 12 месяцев по цене 10. */
export function PricingTable({ compact = false }: { compact?: boolean }) {
  const [yearly, setYearly] = useState(false)

  return (
    <div>
      <div className="mx-auto mb-10 flex w-fit items-center gap-1 rounded-full border border-white/10 bg-ink-850/70 p-1">
        <button
          type="button"
          onClick={() => setYearly(false)}
          className={`rounded-full px-4 py-2 text-sm transition-colors ${
            yearly ? 'text-text-muted hover:text-text-primary' : 'bg-white/10 text-text-primary'
          }`}
        >
          Помесячно
        </button>
        <button
          type="button"
          onClick={() => setYearly(true)}
          className={`rounded-full px-4 py-2 text-sm transition-colors ${
            yearly ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          На год <span className="text-success">−17%</span>
        </button>
      </div>

      <div className={`grid gap-5 ${compact ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
        {PLANS.filter((plan) => !plan.negotiable).map((plan) => {
          const price = yearly ? plan.priceYearly : plan.priceMonthly
          const period = plan.priceMonthly === 0 ? 'навсегда' : yearly ? 'в год' : 'в месяц'

          return (
            <div
              key={plan.id}
              className={`card card-hover relative flex flex-col p-6 ${
                plan.highlighted ? 'border-brand-500/60 shadow-[0_20px_60px_-30px_rgba(59,123,250,0.9)]' : ''
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-1 text-xs font-medium text-white">
                  Выбирают чаще всего
                </span>
              )}

              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-text-muted">{plan.tagline}</p>

              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight">
                  {price === 0 ? '0 ₽' : formatPrice(price)}
                </span>
                <span className="text-sm text-text-muted">{period}</span>
              </div>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm text-text-secondary">
                    <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 16 16" fill="none">
                      <path
                        d="m3.5 8.5 3 3 6-7"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.priceMonthly === 0 ? '/registraciya' : `/kabinet/podpiska?plan=${plan.id}&months=${yearly ? 12 : 1}`}
                className={buttonClass(plan.highlighted ? 'primary' : 'secondary', 'md', 'mt-6 w-full')}
              >
                {plan.priceMonthly === 0 ? 'Начать бесплатно' : 'Оформить подписку'}
              </Link>
            </div>
          )
        })}
      </div>

      {/* Корпоративный тариф: цена и число сессий согласовываются отдельно */}
      <div className="card mt-5 grid gap-6 border-white/12 p-6 md:grid-cols-[1.4fr_1fr] md:items-center sm:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold">{getPlan('corporate').name}</h3>
            <span className="pill !py-0.5 !text-[11px]">цена договорная</span>
          </div>
          <p className="mt-2 text-sm text-text-secondary">{getPlan('corporate').tagline}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {getPlan('corporate').features.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-sm text-text-secondary">
                <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 16 16" fill="none">
                  <path
                    d="m3.5 8.5 3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-5">
          <p className="text-sm text-text-muted">Сколько одновременных сессий нужно?</p>
          <p className="mt-2 text-2xl font-semibold">25, 50, 100 и больше</p>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Считаем по числу специалистов, которые подключаются одновременно. Меняется в любой момент —
            без перехода на другой тариф.
          </p>
          <Link href="/probnyy-period" className={buttonClass('primary', 'md', 'mt-5 w-full')}>
            Обсудить условия
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-text-muted">
        Цены указаны с учётом НДС. Для юридических лиц — оплата по счёту и закрывающие документы.
      </p>
    </div>
  )
}
