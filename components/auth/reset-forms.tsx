'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field } from './auth-form'

/** Шаг 1: почта, на которую придёт ссылка. */
export function ResetRequestForm({ supportEmail }: { supportEmail: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const email = String(new FormData(event.currentTarget).get('email') ?? '')

    try {
      const response = await fetch('/api/v1/auth/reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? 'Не удалось отправить запрос')
        return
      }
      setSentTo(email)
    } catch {
      setError('Сервис недоступен. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  if (sentTo) {
    // Одинаковый ответ для любой почты: не подсказываем, есть ли такой аккаунт.
    return (
      <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-text-primary">
          Если аккаунт с почтой <b>{sentTo}</b> есть, мы отправили на неё ссылку для нового пароля.
        </p>
        <p>
          Ссылка действует час. Письма нет через 10 минут — проверьте папку «Спам» или напишите на{' '}
          <a href={`mailto:${supportEmail}`} className="text-brand-400 underline decoration-dotted">
            {supportEmail}
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Электронная почта аккаунта"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@company.ru"
        required
      />
      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Отправляем…' : 'Прислать ссылку'}
      </Button>
    </form>
  )
}

/** Шаг 2: новый пароль по ссылке из письма. */
export function ResetPasswordForm({ token, minLength }: { token: string; minLength: number }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (password !== String(form.get('repeat') ?? '')) {
      setError('Пароли не совпадают')
      return
    }

    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/v1/auth/reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? 'Не удалось сменить пароль')
        return
      }
      router.replace('/kabinet')
      router.refresh()
    } catch {
      setError('Сервис недоступен. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Новый пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder={`Минимум ${minLength} символов`}
        minLength={minLength}
        required
      />
      <Field label="Ещё раз" name="repeat" type="password" autoComplete="new-password" minLength={minLength} required />
      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Сохраняем…' : 'Сохранить и войти'}
      </Button>
    </form>
  )
}
