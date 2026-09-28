'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Форма служебной команды hbbs/hbbr с выводом ответа сервера. С relayId —
 * команда hbbr на отдельном ретрансляторе.
 */
export function ServerCommandForm({
  target,
  presets,
  relayId,
  initial = 'h',
}: {
  target: 'hbbs' | 'hbbr'
  presets: string[]
  relayId?: string
  initial?: string
}) {
  const [command, setCommand] = useState(initial)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function run(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const response = await fetch(relayId ? '/api/v1/admin/relays' : '/api/v1/admin/server-cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relayId ? { action: 'command', id: relayId, command } : { target, command }),
      })
      const data = (await response.json().catch(() => ({}))) as { output?: string; error?: string }
      if (!response.ok) setError(data.error ?? 'Команда не выполнена')
      else setOutput(data.output || '(пустой ответ)')
    } catch {
      setError('Сервис недоступен')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={run} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          list={`${relayId ?? target}-commands`}
          className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-850/70 px-3 font-mono text-sm
            text-text-primary focus:border-brand-500 focus:outline-none"
          aria-label="Команда"
        />
        <datalist id={`${relayId ?? target}-commands`}>
          {presets.map((preset) => (
            <option key={preset} value={preset} />
          ))}
        </datalist>
        <Button type="submit" size="sm" disabled={pending || !command.trim()}>
          {pending ? 'Выполняем…' : 'Выполнить'}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {output && (
        <pre className="max-h-80 overflow-auto rounded-xl border border-white/8 bg-ink-900/60 p-3 text-xs whitespace-pre-wrap">
          {output}
        </pre>
      )}
    </form>
  )
}
