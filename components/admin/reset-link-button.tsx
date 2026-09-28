'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Ссылка для сброса пароля из админки: когда письмо не дошло или почта ещё
 * не настроена. Ссылку передаёт сам администратор — по телефону, в
 * мессенджере. Она одноразовая и живёт час.
 */
export function ResetLinkButton({ userId, email }: { userId: string; email: string }) {
  const [pending, setPending] = useState(false)
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function create() {
    if (!window.confirm(`Создать ссылку для сброса пароля ${email}? Передайте её только владельцу аккаунта.`)) return
    setPending(true)
    setError('')
    const response = await fetch('/api/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'reset-link' }),
    })
    const data = (await response.json().catch(() => ({}))) as { link?: string; error?: string }
    setPending(false)
    if (!response.ok || !data.link) {
      setError(data.error ?? 'Не удалось создать ссылку')
      return
    }
    setLink(data.link)
    setCopied(false)
  }

  if (link) {
    return (
      <div className="w-full space-y-1.5 rounded-xl border border-white/10 bg-ink-850/60 p-3">
        <p className="text-xs text-text-muted">Одноразовая, действует час:</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-text-primary">{link}</code>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => undefined)
              setCopied(true)
            }}
          >
            {copied ? 'Скопировано' : 'Скопировать'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant="secondary" onClick={create} disabled={pending}>
        {pending ? 'Создаём…' : 'Ссылка для сброса пароля'}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
