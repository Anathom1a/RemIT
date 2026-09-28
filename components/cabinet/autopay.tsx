'use client'

import { createContext, useContext, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * Согласие на автопродление. Отметка одна на все кнопки оплаты и по
 * умолчанию снята: сохранить карту можно только по явному согласию.
 */
const AutoRenewContext = createContext<boolean>(false)

export const useAutoRenew = () => useContext(AutoRenewContext)

export function AutoRenewChoice({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  return (
    <AutoRenewContext.Provider value={checked}>
      <label className="card flex cursor-pointer items-start gap-3 p-5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-1 size-4 shrink-0 accent-brand-500"
        />
        <span className="text-sm leading-relaxed text-text-secondary">
          <span className="font-medium text-text-primary">Продлевать подписку автоматически.</span> Карта сохранится в
          ЮKassa (номер карты у нас не хранится), и в конце каждого оплаченного периода мы спишем стоимость того же
          тарифа за тот же срок — месяц или год. За 3 дня до списания пришлём письмо. Отключить можно здесь же в
          любой момент, оплаченный срок сохранится. Подробно — в{' '}
          <a href="/dokumenty/oferta#avtoprodlenie" className="text-brand-400 underline decoration-dotted">
            оферте
          </a>
          .
        </span>
      </label>
      {children}
    </AutoRenewContext.Provider>
  )
}

/** Отключение автопродления в кабинете. */
export function DisableAutopayButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function disable() {
    if (!window.confirm('Отключить автопродление? Оплаченный срок сохранится, карта будет отвязана.')) return
    setPending(true)
    setError('')
    const response = await fetch('/api/v1/billing/autopay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disable' }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось отключить')
      return
    }
    router.refresh()
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" onClick={disable} disabled={pending}>
        {pending ? 'Отключаем…' : 'Отключить автопродление'}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
