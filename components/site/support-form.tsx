'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const field =
  'w-full rounded-xl border border-white/10 bg-ink-850/70 px-3.5 py-2.5 text-[0.95rem] text-text-primary ' +
  'placeholder:text-text-muted focus:border-brand-500 focus:outline-none'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic'

interface Picked {
  file: File
  preview: string
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`
}

/**
 * Обращение в поддержку из личного кабинета.
 *
 * Почту и имя не спрашиваем: они уже есть в аккаунте. Поэтому и капча не
 * нужна — писать может только вошедший пользователь.
 *
 * К обращению можно приложить снимки экрана: перетаскиванием, выбором файла
 * или вставкой из буфера — после PrtScn скриншот лежит именно там, и просить
 * человека сначала сохранить его в файл незачем.
 */
export function SupportForm({
  maxFiles = 5,
  maxBytes = 10 * 1024 * 1024,
}: {
  maxFiles?: number
  maxBytes?: number
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [picked, setPicked] = useState<Picked[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(incoming: File[]) {
    const images = incoming.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return

    const tooBig = images.find((file) => file.size > maxBytes)
    if (tooBig) {
      setError(`Файл больше ${Math.round(maxBytes / (1024 * 1024))} МБ: ${tooBig.name}`)
      return
    }

    setPicked((current) => {
      const room = maxFiles - current.length
      if (room <= 0) {
        setError(`Можно приложить не больше ${maxFiles} файлов`)
        return current
      }
      setError('')
      const added = images.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))
      return [...current, ...added]
    })
  }

  function removeAt(index: number) {
    setPicked((current) => {
      URL.revokeObjectURL(current[index].preview)
      return current.filter((_, i) => i !== index)
    })
    setError('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const form = new FormData(event.currentTarget)
    // Поле выбора файлов очищаем и собираем список сами: в нём нет того,
    // что перетащили или вставили из буфера.
    form.delete('files')
    for (const item of picked) form.append('files', item.file, item.file.name)

    const response = await fetch('/api/v1/support/tickets', { method: 'POST', body: form })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)
    if (!response.ok) {
      setError(data.error ?? 'Не удалось отправить обращение')
      return
    }
    setDone(true)
    // Обновляем список обращений ниже формы.
    window.location.reload()
  }

  if (done) {
    return (
      <p className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-text-primary">
        Обращение принято. Ответ придёт сюда же, в кабинет.
      </p>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      onPaste={(event) => addFiles([...event.clipboardData.files])}
      className="space-y-3"
    >
      <div>
        <label htmlFor="subject" className="mb-1.5 block text-sm text-text-secondary">
          Тема
        </label>
        <input
          id="subject"
          name="subject"
          required
          maxLength={160}
          placeholder="Например: не подключается к компьютеру в офисе"
          className={field}
        />
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm text-text-secondary">
          Что произошло
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={4000}
          placeholder="Опишите, что делали и что пошло не так. Если есть ID устройства — укажите его: так разберёмся быстрее."
          className={field}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm text-text-secondary">
          Снимки экрана и фотографии{' '}
          <span className="text-text-muted">— необязательно, до {maxFiles} шт.</span>
        </span>
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            addFiles([...event.dataTransfer.files])
          }}
          className={`rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
            dragging ? 'border-brand-500 bg-brand-500/8' : 'border-white/15 bg-ink-850/40'
          }`}
        >
          <p className="text-sm text-text-secondary">
            Перетащите сюда, вставьте из буфера (Ctrl+V) или{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-brand-400 underline decoration-dotted"
            >
              выберите файл
            </button>
          </p>
          <p className="mt-1 text-xs text-text-muted">
            PNG, JPEG, WebP, GIF или HEIC, до {Math.round(maxBytes / (1024 * 1024))} МБ каждый
          </p>
          <input
            ref={inputRef}
            type="file"
            name="files"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles([...(event.target.files ?? [])])
              // Позволяет выбрать тот же файл ещё раз после удаления.
              event.target.value = ''
            }}
          />
        </div>

        {picked.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-3">
            {picked.map((item, index) => (
              <li
                key={item.preview}
                className="relative overflow-hidden rounded-xl border border-white/10 bg-ink-850/70"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt="" className="size-24 object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label="Убрать файл"
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-ink-950/80 text-text-primary hover:bg-danger/80"
                >
                  ×
                </button>
                <span className="block px-2 py-1 text-center text-[0.7rem] text-text-muted">
                  {formatSize(item.file.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Отправляем…' : 'Отправить обращение'}
      </Button>
    </form>
  )
}
