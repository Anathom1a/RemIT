'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * Форма, которая отправляет поля как JSON вместе с постоянной частью
 * (например, действием и книгой), показывает ошибку и обновляет страницу.
 */
export function JsonForm({
  endpoint,
  body,
  submitLabel,
  pendingLabel = 'Сохраняем…',
  reset = false,
  className = 'space-y-3',
  variant = 'primary',
  children,
}: {
  endpoint: string
  body: Record<string, unknown>
  submitLabel: string
  pendingLabel?: string
  /** Очистить поля после успеха — для форм добавления. */
  reset?: boolean
  className?: string
  variant?: 'primary' | 'secondary'
  children: ReactNode
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setPending(true)
    setError('')
    try {
      const fields = Object.fromEntries(new FormData(form).entries())
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, ...body }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? 'Не удалось сохранить')
        return
      }
      if (reset) form.reset()
      router.refresh()
    } catch {
      setError('Сервис недоступен. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  )
}

export const inputClass = `h-10 w-full rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm text-text-primary
  placeholder:text-text-muted focus:border-brand-500 focus:outline-none`
