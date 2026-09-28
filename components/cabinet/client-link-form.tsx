'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/** Перенос прежнего аккаунта клиента: логин и пароль, которыми входили раньше. */
export function ClientLinkForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setDone('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      const response = await fetch('/api/v1/account/client-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: form.get('login'), password: form.get('password') }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string; login?: string }
      if (!response.ok) {
        setError(data.error ?? 'Не удалось перенести аккаунт')
        return
      }
      formElement.reset()
      setDone('Готово. Войдите в клиенте заново — почтой и паролем от кабинета.')
      router.refresh()
    } catch {
      setError('Сервис недоступен. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  const input = `h-11 w-full rounded-xl border border-white/10 bg-ink-850/70 px-3.5 text-[0.95rem] text-text-primary
    placeholder:text-text-muted focus:border-brand-500 focus:outline-none`

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="login" required autoComplete="off" placeholder="Прежний логин" className={input} />
        <input name="password" type="password" required autoComplete="off" placeholder="Прежний пароль" className={input} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Переносим…' : 'Перенести'}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {done && <p className="text-sm text-success">{done}</p>}
    </form>
  )
}
