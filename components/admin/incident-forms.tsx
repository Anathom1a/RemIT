'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

const field = `rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm text-text-primary
  focus:border-brand-500 focus:outline-none`

async function post(body: Record<string, unknown>) {
  const response = await fetch('/api/v1/admin/monitoring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(data.error ?? 'Не удалось сохранить')
  return data
}

/** Новый инцидент или плановые работы. */
export function IncidentCreateForm({ components }: { components: { id: string; name: string }[] }) {
  const router = useRouter()
  const [impact, setImpact] = useState<'minor' | 'major' | 'maintenance'>('minor')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await post({
        action: 'incident-create',
        impact,
        title,
        text,
        components: selected,
        // datetime-local — время браузера; на сервер уходит абсолютное.
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      })
      setTitle('')
      setText('')
      setSelected([])
      setStartsAt('')
      setEndsAt('')
      router.refresh()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['minor', 'Частичный сбой'],
            ['major', 'Серьёзный сбой'],
            ['maintenance', 'Плановые работы'],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${impact === value ? 'border-brand-500 text-text-primary' : 'border-white/10 text-text-secondary'}`}
          >
            <input type="radio" name="impact" value={value} checked={impact === value} onChange={() => setImpact(value)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={impact === 'maintenance' ? 'Обновление сервера' : 'Не подключаются компьютеры'}
        aria-label="Заголовок"
        required
        className={`${field} h-10 w-full`}
      />
      <div className="flex flex-wrap gap-3">
        {components.map((component) => (
          <label key={component.id} className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={selected.includes(component.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked ? [...current, component.id] : current.filter((id) => id !== component.id),
                )
              }
              className="accent-brand-500"
            />
            {component.name}
          </label>
        ))}
      </div>
      {impact === 'maintenance' && (
        <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
          <label className="flex flex-col gap-1">
            Начало (пусто — сейчас)
            <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={`${field} h-10`} />
          </label>
          <label className="flex flex-col gap-1">
            Окончание
            <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={`${field} h-10`} />
          </label>
        </div>
      )}
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Что происходит и что делать пользователям — увидят все на странице статуса"
        aria-label="Описание"
        required
        rows={3}
        className={`${field} w-full py-2`}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" size="sm" disabled={pending || !title.trim() || !text.trim() || selected.length === 0}>
        {pending ? 'Публикуем…' : 'Опубликовать'}
      </Button>
    </form>
  )
}

/** Новая запись в хронологии открытого инцидента. */
export function IncidentUpdateForm({ id, maintenance }: { id: string; maintenance: boolean }) {
  const router = useRouter()
  const statuses = maintenance
    ? ([
        ['in_progress', 'Идут работы'],
        ['completed', 'Завершено'],
      ] as const)
    : ([
        ['identified', 'Причина найдена'],
        ['monitoring', 'Наблюдаем'],
        ['investigating', 'Разбираемся'],
        ['resolved', 'Решено'],
      ] as const)
  const [status, setStatus] = useState<string>(statuses[0][0])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await post({ action: 'incident-update', id, status, text })
      setText('')
      router.refresh()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
      <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${field} h-9`} aria-label="Статус">
        {statuses.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={status === 'resolved' || status === 'completed' ? 'Можно без текста' : 'Что изменилось'}
        aria-label="Текст обновления"
        className={`${field} h-9 min-w-0 flex-1`}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? '…' : 'Добавить'}
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  )
}
