'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/** Привязка устройства к аккаунту по ID из клиента. */
export function DeviceForm() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const response = await fetch('/api/v1/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rustdeskId: value.replace(/\s+/g, '') }),
    })
    const data = (await response.json()) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось привязать устройство')
      return
    }
    setValue('')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Например, 741 208 365"
          inputMode="numeric"
          className="h-11 flex-1 rounded-xl border border-white/10 bg-ink-850/70 px-3.5 font-mono text-[0.95rem]
            text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none"
        />
        <Button type="submit" disabled={pending || value.trim().length === 0}>
          {pending ? 'Привязываем…' : 'Привязать'}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}
