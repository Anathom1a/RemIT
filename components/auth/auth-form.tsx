'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/** Форма входа и регистрации: один компонент, отличается только режимом. */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const endpoint = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          name: form.get('name') ?? '',
        }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? 'Не удалось выполнить запрос')
        return
      }
      router.push('/kabinet')
      router.refresh()
    } catch {
      setError('Сервис недоступен. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'register' && (
        <Field label="Как к вам обращаться" name="name" type="text" autoComplete="name" placeholder="Иван" />
      )}
      <Field
        label="Электронная почта"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@company.ru"
        required
      />
      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        placeholder={mode === 'register' ? 'Минимум 8 символов' : ''}
        required
      />

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
      </Button>
    </form>
  )
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-text-secondary">{label}</span>
      <input
        {...props}
        className="h-11 w-full rounded-xl border border-white/10 bg-ink-850/70 px-3.5 text-[0.95rem] text-text-primary
          placeholder:text-text-muted focus:border-brand-500 focus:outline-none"
      />
    </label>
  )
}
