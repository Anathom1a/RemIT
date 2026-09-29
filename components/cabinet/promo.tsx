'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { promoApplies, promoDiscount, type PromoTerms } from '@/lib/promo-math'

/** Применённый промокод — один на все кнопки оплаты страницы. */
const PromoContext = createContext<PromoTerms | null>(null)

export const usePromo = () => useContext(PromoContext)

/** Цена с учётом промокода; null — промокод к этому заказу не относится. */
export function usePromoPrice(plan: string, months: number, amount: number): number | null {
  const promo = usePromo()
  if (!promo || !promoApplies(promo, plan, months)) return null
  return amount - promoDiscount(promo, amount)
}

const field =
  'h-10 w-44 rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm uppercase text-text-primary placeholder:normal-case placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

export function PromoProvider({ initialCode = '', children }: { initialCode?: string; children: React.ReactNode }) {
  const [code, setCode] = useState(initialCode)
  const [terms, setTerms] = useState<PromoTerms | null>(null)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function apply(value = code) {
    if (!value.trim()) return
    setPending(true)
    setError('')
    const response = await fetch(`/api/v1/billing/promo?code=${encodeURIComponent(value.trim())}`)
    const data = (await response.json().catch(() => ({}))) as { terms?: PromoTerms; description?: string; error?: string }
    setPending(false)
    if (!response.ok || !data.terms) {
      setTerms(null)
      setError(data.error ?? 'Не удалось проверить промокод')
      return
    }
    setTerms(data.terms)
    setDescription(data.description ?? '')
  }

  // Код из ссылки (?promo=…) проверяем сразу.
  useEffect(() => {
    if (initialCode) void apply(initialCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode])

  return (
    <PromoContext.Provider value={terms}>
      <div className="card flex flex-wrap items-center gap-3 p-5">
        {terms ? (
          <>
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary">
              <span className="font-medium text-success">Промокод {terms.code} применён:</span> {description}. Цены
              ниже — со скидкой. Скидка действует на этот платёж; автопродление — по обычной цене.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTerms(null)
                setCode('')
              }}
            >
              Убрать
            </Button>
          </>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void apply()
            }}
          >
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Промокод"
              aria-label="Промокод"
              className={field}
            />
            <Button type="submit" variant="secondary" size="sm" disabled={pending || !code.trim()}>
              {pending ? 'Проверяем…' : 'Применить'}
            </Button>
            {error && <span className="text-sm text-danger">{error}</span>}
          </form>
        )}
      </div>
      {children}
    </PromoContext.Provider>
  )
}
