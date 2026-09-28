'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/cabinet/json-form'

/** Создание гостевой ссылки веб-клиента с показом готовой ссылки. */
export function ShareForm({ deviceIds }: { deviceIds: string[] }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setPending(true)
    setError('')
    setUrl('')
    try {
      const fields = Object.fromEntries(new FormData(form).entries())
      const response = await fetch('/api/v1/webclient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'share', ...fields }),
      })
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok || !data.url) {
        setError(data.error ?? 'Не удалось создать ссылку')
        return
      }
      setUrl(data.url)
      form.reset()
      router.refresh()
    } catch {
      setError('Сервис недоступен. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="peerId" required list="share-devices" placeholder="ID устройства" className={`${inputClass} font-mono`} />
        <datalist id="share-devices">
          {deviceIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <input name="password" type="password" required autoComplete="off" placeholder="Пароль устройства" className={inputClass} />
        <select name="passwordType" defaultValue="once" className={inputClass} aria-label="Тип ссылки">
          <option value="once">Одноразовая</option>
          <option value="fixed">Многоразовая</option>
        </select>
        <select name="ttl" defaultValue="1d" className={inputClass} aria-label="Срок">
          <option value="1h">Действует 1 час</option>
          <option value="1d">Действует сутки</option>
          <option value="7d">Действует неделю</option>
          <option value="30d">Действует 30 дней</option>
          <option value="never">Бессрочно</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Создаём…' : 'Создать ссылку'}
        </Button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
      {url && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm">
          <p className="text-text-secondary">Ссылка готова — отправьте её гостю:</p>
          <p className="mt-1 break-all font-mono text-xs text-text-primary">{url}</p>
          <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => navigator.clipboard?.writeText(url)}>
            Скопировать
          </Button>
        </div>
      )}
    </form>
  )
}
