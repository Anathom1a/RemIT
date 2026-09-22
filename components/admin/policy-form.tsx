'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { ClientPolicy } from '@/lib/policy'

interface Row {
  key: string
  value: string
}

const field =
  'h-10 w-full rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

/**
 * Настройки, которые сервер рассылает всем клиентам. Клиент применяет их сам
 * на ближайшем heartbeat — переустанавливать ничего не нужно.
 */
export function PolicyForm({
  policy,
  hints,
}: {
  policy: ClientPolicy
  hints: { key: string; title: string; example: string }[]
}) {
  const router = useRouter()
  const initial = Object.entries(policy.options).map(([key, value]) => ({ key, value }))
  const [rows, setRows] = useState<Row[]>(initial.length > 0 ? initial : [{ key: '', value: '' }])
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function save() {
    setPending(true)
    setStatus('')

    const options = Object.fromEntries(rows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]))

    const response = await fetch('/api/v1/admin/policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    setStatus(
      response.ok
        ? 'Сохранено. Клиенты применят настройки в течение 15 секунд после ближайшего heartbeat.'
        : (data.error ?? 'Не удалось сохранить'),
    )
    if (response.ok) router.refresh()
  }

  return (
    <div className="space-y-4">
      <datalist id="policy-keys">
        {hints.map((hint) => (
          <option key={hint.key} value={hint.key}>
            {hint.title}
          </option>
        ))}
      </datalist>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input
              list="policy-keys"
              value={row.key}
              onChange={(event) => update(index, { key: event.target.value })}
              placeholder="custom-rendezvous-server"
              className={`${field} font-mono text-xs sm:text-sm`}
            />
            <input
              value={row.value}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder="remit.su"
              className={`${field} font-mono text-xs sm:text-sm`}
            />
            <Button
              variant="danger"
              size="sm"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              disabled={rows.length === 1}
            >
              Убрать
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setRows((current) => [...current, { key: '', value: '' }])}>
          Добавить настройку
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? 'Сохраняем…' : 'Разослать клиентам'}
        </Button>
      </div>

      {status && <p className="text-sm text-text-secondary">{status}</p>}

      <details className="rounded-xl border border-white/8 bg-ink-850/40 p-4">
        <summary className="cursor-pointer text-sm text-text-secondary">Частые настройки</summary>
        <ul className="mt-3 space-y-1.5 text-sm text-text-muted">
          {hints.map((hint) => (
            <li key={hint.key}>
              <code className="font-mono text-xs text-text-secondary">{hint.key}</code> — {hint.title}
              {hint.example && <span className="text-text-muted"> (например: {hint.example})</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
