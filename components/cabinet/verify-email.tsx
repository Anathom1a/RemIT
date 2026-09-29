'use client'

import { useState } from 'react'

/** Баннер «подтвердите почту» с повторной отправкой письма. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'sent'>('idle')
  const [error, setError] = useState('')

  async function resend() {
    setState('pending')
    setError('')
    const response = await fetch('/api/v1/auth/verify', { method: 'POST' })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) {
      setError(data.error ?? 'Не удалось отправить письмо')
      setState('idle')
      return
    }
    setState('sent')
  }

  return (
    <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/5 px-5 py-4 text-sm leading-relaxed text-text-secondary">
      Подтвердите почту <b className="text-text-primary">{email}</b> — ссылка в письме после регистрации. Без этого
      нельзя оплатить подписку: на почту приходят кассовые чеки.{' '}
      {state === 'sent' ? (
        <span className="text-success">Письмо отправлено — проверьте и папку «Спам».</span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={state === 'pending'}
          className="text-brand-400 underline decoration-dotted disabled:opacity-60"
        >
          {state === 'pending' ? 'Отправляем…' : 'Отправить письмо ещё раз'}
        </button>
      )}
      {error && <span className="mt-1 block text-danger">{error}</span>}
    </div>
  )
}
