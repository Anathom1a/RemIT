'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * Кнопка административного действия: отправляет JSON, показывает ошибку и
 * обновляет данные страницы. Опасные действия подтверждаются вопросом.
 */
export function ActionButton({
  endpoint,
  body,
  label,
  pendingLabel = 'Выполняем…',
  confirm,
  variant = 'secondary',
  size = 'sm',
  method = 'POST',
}: {
  endpoint: string
  body?: Record<string, unknown>
  label: string
  pendingLabel?: string
  confirm?: string
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md'
  method?: 'POST' | 'DELETE'
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    if (confirm && !window.confirm(confirm)) return
    setPending(true)
    setError('')

    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось выполнить действие')
      return
    }
    router.refresh()
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant={variant} size={size} onClick={handleClick} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
