'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { Release, ReleaseFile } from '@/lib/types'

const OS_OPTIONS = ['windows', 'macos', 'linux', 'android', 'ios']

const emptyFile = (): ReleaseFile => ({ os: 'windows', arch: 'x86_64', url: '', sha256: '', size: 0 })

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`
}

const field =
  'h-10 w-full rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

/** Форма выпуска: версия, канал, файлы сборок и заметки. */
export function ReleaseForm({ release }: { release?: Release }) {
  const router = useRouter()
  const [version, setVersion] = useState(release?.version ?? '')
  const [channel, setChannel] = useState<'stable' | 'beta'>(release?.channel ?? 'stable')
  const [mandatory, setMandatory] = useState(release?.mandatory ?? false)
  const [notes, setNotes] = useState(release?.notes ?? '')
  const [files, setFiles] = useState<ReleaseFile[]>(release?.files?.length ? release.files : [emptyFile()])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  /** Ход загрузки по каждой строке файла: 0–100 или -1, когда загрузки нет. */
  const [progress, setProgress] = useState<Record<number, number>>({})
  const [uploadError, setUploadError] = useState<Record<number, string>>({})

  function updateFile(index: number, patch: Partial<ReleaseFile>) {
    setFiles((current) => current.map((file, i) => (i === index ? { ...file, ...patch } : file)))
  }

  /**
   * Загрузка сборки на наш сервер. Файл уходит потоком, прогресс показываем
   * через XMLHttpRequest — fetch о ходе отправки не сообщает.
   */
  function uploadFile(index: number, file: File) {
    if (!/^\d+(\.\d+){1,3}$/.test(version.trim())) {
      setUploadError((current) => ({ ...current, [index]: 'Сначала укажите версию выпуска, например 1.4.2' }))
      return
    }

    setUploadError((current) => ({ ...current, [index]: '' }))
    setProgress((current) => ({ ...current, [index]: 0 }))

    const request = new XMLHttpRequest()
    const query = new URLSearchParams({ version: version.trim(), name: file.name })
    request.open('PUT', `/api/v1/admin/releases/upload?${query}`)

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      setProgress((current) => ({ ...current, [index]: Math.round((event.loaded / event.total) * 100) }))
    }

    request.onload = () => {
      setProgress((current) => ({ ...current, [index]: -1 }))
      let data: { url?: string; size?: number; sha256?: string; error?: string } = {}
      try {
        data = JSON.parse(request.responseText)
      } catch {
        data = {}
      }
      if (request.status >= 200 && request.status < 300 && data.url) {
        updateFile(index, { url: data.url, size: data.size ?? 0, sha256: data.sha256 ?? '' })
      } else {
        setUploadError((current) => ({ ...current, [index]: data.error ?? 'Не удалось загрузить файл' }))
      }
    }

    request.onerror = () => {
      setProgress((current) => ({ ...current, [index]: -1 }))
      setUploadError((current) => ({ ...current, [index]: 'Обрыв соединения при загрузке' }))
    }

    request.send(file)
  }

  async function submit(published: boolean) {
    setPending(true)
    setError('')

    const response = await fetch('/api/v1/admin/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: release?.id,
        version,
        channel,
        mandatory,
        notes,
        published,
        files: files.filter((file) => file.url.trim()),
      }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось сохранить выпуск')
      return
    }

    if (!release) {
      setVersion('')
      setNotes('')
      setFiles([emptyFile()])
    }
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Версия</span>
          <input
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder="1.4.2"
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Канал</span>
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value as 'stable' | 'beta')}
            className={field}
          >
            <option value="stable">stable — всем</option>
            <option value="beta">beta — только тестировщикам</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={mandatory}
            onChange={(event) => setMandatory(event.target.checked)}
            className="size-4 accent-[color:var(--color-brand-500)]"
          />
          <span className="text-sm text-text-secondary">Обязательное обновление</span>
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-sm text-text-secondary">Что изменилось</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          placeholder="Одна строка — один пункт списка"
          className="w-full rounded-xl border border-white/10 bg-ink-850/70 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none"
        />
      </div>

      <div className="space-y-3">
        <span className="block text-sm text-text-secondary">Файлы сборок</span>
        {files.map((file, index) => (
          <div key={index} className="rounded-xl border border-white/8 bg-ink-850/40 p-3">
            <div className="grid gap-2 sm:grid-cols-[130px_130px_1fr]">
              <select value={file.os} onChange={(event) => updateFile(index, { os: event.target.value })} className={field}>
                {OS_OPTIONS.map((os) => (
                  <option key={os} value={os}>
                    {os}
                  </option>
                ))}
              </select>
              <input
                value={file.arch}
                onChange={(event) => updateFile(index, { arch: event.target.value })}
                placeholder="x86_64"
                className={field}
              />
              <input
                value={file.url}
                onChange={(event) => updateFile(index, { url: event.target.value })}
                placeholder="загрузите файл или вставьте ссылку"
                className={field}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/12 bg-ink-800/70 px-3.5 py-2 text-sm text-text-primary hover:border-white/25">
                <svg viewBox="0 0 20 20" fill="none" className="size-4">
                  <path
                    d="M10 14V4m0 0L6 8m4-4 4 4M3 15v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Загрузить файл
                <input
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0]
                    if (selected) uploadFile(index, selected)
                    event.target.value = ''
                  }}
                />
              </label>

              {file.url.startsWith('/api/download/') && (
                <span className="text-xs text-success">файл на сайте{file.size ? `, ${formatSize(file.size)}` : ''}</span>
              )}

              <Button
                variant="danger"
                size="sm"
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                disabled={files.length === 1}
              >
                Убрать
              </Button>
            </div>

            {(progress[index] ?? -1) >= 0 && (
              <div className="mt-2">
                <div className="h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-accent transition-all"
                    style={{ width: `${progress[index]}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-text-muted">Загрузка… {progress[index]}%</p>
              </div>
            )}

            {uploadError[index] && <p className="mt-2 text-xs text-danger">{uploadError[index]}</p>}

            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-text-muted">
                Контрольная сумма и размер
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px]">
                <input
                  value={file.sha256}
                  onChange={(event) => updateFile(index, { sha256: event.target.value })}
                  placeholder="SHA-256 — заполняется при загрузке"
                  className={field}
                />
                <input
                  value={file.size || ''}
                  onChange={(event) => updateFile(index, { size: Number.parseInt(event.target.value, 10) || 0 })}
                  placeholder="размер, байт"
                  inputMode="numeric"
                  className={field}
                />
              </div>
            </details>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setFiles((current) => [...current, emptyFile()])}>
          Добавить файл
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => submit(true)} disabled={pending}>
          {pending ? 'Сохраняем…' : release ? 'Сохранить и опубликовать' : 'Опубликовать выпуск'}
        </Button>
        <Button variant="secondary" onClick={() => submit(false)} disabled={pending}>
          Сохранить черновиком
        </Button>
      </div>
    </div>
  )
}
