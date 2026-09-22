'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const field =
  'w-full rounded-xl border border-white/10 bg-ink-850/70 px-3.5 py-2.5 text-[0.95rem] text-text-primary ' +
  'placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

/**
 * Обращение в поддержку из личного кабинета.
 *
 * Почту и имя не спрашиваем: они уже есть в аккаунте. Поэтому и капча не
 * нужна — писать может только вошедший пользователь.
 */
export function SupportForm() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/v1/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: form.get('subject'), message: form.get('message') }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось отправить обращение')
      return
    }
    setDone(true)
    // Обновляем список обращений ниже формы.
    window.location.reload()
  }

  if (done) {
    return (
      <p className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-text-primary">
        Обращение принято. Ответ придёт сюда же, в кабинет.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="subject" className="mb-1.5 block text-sm text-text-secondary">
          Тема
        </label>
        <input
          id="subject"
          name="subject"
          required
          maxLength={160}
          placeholder="Например: не подключается к компьютеру в офисе"
          className={field}
        />
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm text-text-secondary">
          Что произошло
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={4000}
          placeholder="Опишите, что делали и что пошло не так. Если есть ID устройства — укажите его: так разберёмся быстрее."
          className={field}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Отправляем…' : 'Отправить обращение'}
      </Button>
    </form>
  )
}
