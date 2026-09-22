'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * Изменение числа одновременных сессий у действующей подписки.
 * Нужно корпоративным клиентам: договорились на 40 сессий — поменяли здесь,
 * тариф и срок при этом не трогаются.
 */
export function SessionLimit({
  userId,
  current,
  planDefault,
}: {
  userId: string
  /** Персональное значение; null — действует значение тарифа. */
  current: number | null
  planDefault: number
}) {
  const router = useRouter()
  const [value, setValue] = useState(String(current ?? planDefault))
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')

  async function save(concurrent: string | null) {
    setPending(true)
    setStatus('')

    const response = await fetch('/api/v1/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'limits', userId, concurrent }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string; effectiveLimit?: number }

    setPending(false)
    if (!response.ok) {
      setStatus(data.error ?? 'Не удалось изменить лимит')
      return
    }
    setStatus(`Теперь ${data.effectiveLimit} одновременных сессий`)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-text-muted">Одновременных сессий:</span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        inputMode="numeric"
        className="h-9 w-20 rounded-lg border border-white/10 bg-ink-850/70 px-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none"
      />
      <Button size="sm" onClick={() => save(value)} disabled={pending}>
        {pending ? 'Сохраняем…' : 'Применить'}
      </Button>
      {current !== null && (
        <Button size="sm" variant="secondary" onClick={() => save(null)} disabled={pending}>
          Вернуть к тарифу ({planDefault})
        </Button>
      )}
      {status && <span className="text-xs text-text-secondary">{status}</span>}
    </div>
  )
}
