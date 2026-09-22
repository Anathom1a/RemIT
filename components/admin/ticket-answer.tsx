'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

const field =
  'w-full rounded-xl border border-white/10 bg-ink-850/70 px-3.5 py-2.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

/**
 * Ответ на обращение. Текст уходит пользователю в кабинет, статус
 * обращения при этом сам переходит в «отвечено».
 */
export function TicketAnswer({ ticketId, answer = '' }: { ticketId: string; answer?: string }) {
  const router = useRouter()
  const [text, setText] = useState(answer)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    if (text.trim().length < 2) {
      setError('Напишите ответ')
      return
    }
    setPending(true)
    setError('')

    const response = await fetch('/api/v1/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ticketId, answer: text }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось отправить ответ')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <textarea
        rows={4}
        maxLength={4000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ответ пользователю — он увидит его в кабинете"
        className={field}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button size="sm" onClick={send} disabled={pending}>
        {pending ? 'Отправляем…' : answer ? 'Обновить ответ' : 'Ответить'}
      </Button>
    </div>
  )
}
