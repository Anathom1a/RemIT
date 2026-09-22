'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const field =
  'h-11 w-full rounded-xl border border-white/10 bg-ink-850/70 px-3.5 text-[0.95rem] text-text-primary ' +
  'placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

/** Заявка компании на пробный период. Отправляется без регистрации. */
export function TrialForm({ trialDays, supportUrl }: { trialDays: number; supportUrl: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/v1/trial/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        company: form.get('company'),
        email: form.get('email'),
        phone: form.get('phone'),
        devices: form.get('devices'),
        comment: form.get('comment'),
        website: form.get('website'),
      }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось отправить заявку')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <svg viewBox="0 0 24 24" fill="none" className="size-6">
            <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-semibold">Заявка принята</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Менеджер посмотрит заявку и откроет пробный период до {trialDays} дней на ваш аккаунт — обычно в
          тот же рабочий день. Если нужно срочно, напишите в поддержку:{' '}
          <a href={supportUrl} className="text-brand-400 underline decoration-dotted">
            {supportUrl}
          </a>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6 sm:p-8">
      {/* Ловушка для ботов: поле скрыто от людей. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Имя*</span>
          <input name="name" required placeholder="Иван Петров" className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Компания</span>
          <input name="company" placeholder="ООО «Ромашка»" className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Рабочая почта*</span>
          <input name="email" type="email" required placeholder="ivan@company.ru" className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Телефон</span>
          <input name="phone" type="tel" placeholder="+7 900 000-00-00" className={field} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm text-text-secondary">Сколько компьютеров планируете подключить</span>
        <input name="devices" placeholder="Например, 25" className={field} />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm text-text-secondary">Задача</span>
        <textarea
          name="comment"
          rows={3}
          placeholder="Например: поддержка филиалов, доступ к кассам, работа из дома"
          className="w-full rounded-xl border border-white/10 bg-ink-850/70 px-3.5 py-2.5 text-[0.95rem] text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none"
        />
      </label>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Отправляем…' : `Получить пробный период до ${trialDays} дней`}
      </Button>

      <p className="text-center text-xs leading-relaxed text-text-muted">
        Доступ открывает менеджер после проверки заявки. Нажимая кнопку, вы соглашаетесь с{' '}
        <a href="/dokumenty/soglasie" className="underline decoration-dotted">
          обработкой персональных данных
        </a>{' '}
        и{' '}
        <a href="/dokumenty/soglashenie" className="underline decoration-dotted">
          пользовательским соглашением
        </a>
        . Карта не нужна, оплата не списывается.
      </p>
    </form>
  )
}
