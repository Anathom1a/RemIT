'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { RuntimeSettings } from '@/lib/settings'

/** Настройки сервиса, которые применяются без перезапуска. */
export function SettingsForm({ settings }: { settings: RuntimeSettings }) {
  const router = useRouter()
  const [hours, setHours] = useState((settings.freeSecondsPerDay / 3600).toString())
  const [registration, setRegistration] = useState(settings.registrationEnabled)
  const [message, setMessage] = useState(settings.maintenanceMessage)
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)

  async function save(key: string, value: string) {
    setPending(true)
    setStatus('')

    const response = await fetch('/api/v1/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    setStatus(response.ok ? 'Сохранено' : (data.error ?? 'Не удалось сохранить'))
    if (response.ok) router.refresh()
  }

  const field =
    'h-10 w-full rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm text-text-primary focus:border-brand-500 focus:outline-none'

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1.5 block text-sm text-text-secondary">
          Бесплатный лимит, часов в сутки
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            inputMode="decimal"
            className={`${field} max-w-32`}
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => save('freeSecondsPerDay', String(Math.round(Number(hours.replace(',', '.')) * 3600)))}
          >
            Сохранить
          </Button>
          <span className="text-xs text-text-muted">
            Сейчас: {settings.freeSecondsPerDay} секунд. Применяется к новым проверкам в течение 10 секунд.
          </span>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-text-secondary">Самостоятельная регистрация</label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={registration ? 'primary' : 'secondary'}
            disabled={pending}
            onClick={() => {
              setRegistration(true)
              void save('registrationEnabled', 'true')
            }}
          >
            Открыта
          </Button>
          <Button
            size="sm"
            variant={registration ? 'secondary' : 'primary'}
            disabled={pending}
            onClick={() => {
              setRegistration(false)
              void save('registrationEnabled', 'false')
            }}
          >
            Закрыта
          </Button>
          <span className="text-xs text-text-muted">
            При закрытой регистрации форма на сайте отвечает отказом, вход существующих аккаунтов работает.
          </span>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-text-secondary">
          Сообщение в кабинете (работы, авария, акция)
        </label>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Пусто — сообщение не показывается"
          className="w-full rounded-xl border border-white/10 bg-ink-850/70 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" disabled={pending} onClick={() => save('maintenanceMessage', message)}>
            Сохранить
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setMessage(''); void save('maintenanceMessage', '') }}>
            Убрать
          </Button>
        </div>
      </div>

      {status && <p className="text-sm text-text-secondary">{status}</p>}
    </div>
  )
}
