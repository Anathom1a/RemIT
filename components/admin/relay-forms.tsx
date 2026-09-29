'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CITIES } from '@/lib/geo-cities'

const inputClass = `h-10 min-w-0 rounded-xl border border-white/10 bg-ink-850/70 px-3 text-sm text-text-primary
  focus:border-brand-500 focus:outline-none`

async function post(body: Record<string, unknown>) {
  const response = await fetch('/api/v1/admin/relays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string; install?: string }
  if (!response.ok) throw new Error(data.error ?? 'Не удалось выполнить действие')
  return data
}

function InstallBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted">
        Выполните на новой машине (Ubuntu 22.04/24.04) из копии репозитория. В команде — токен узла, не публикуйте её.
      </p>
      <pre className="overflow-auto rounded-xl border border-white/8 bg-ink-900/60 p-3 text-xs whitespace-pre">{command}</pre>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          navigator.clipboard?.writeText(command).then(() => setCopied(true))
        }}
      >
        {copied ? 'Скопировано' : 'Скопировать'}
      </Button>
    </div>
  )
}

/** Подсказка городов для поля «Регион»: по ним координаты ставятся сами. */
function CityList() {
  return (
    <datalist id="relay-cities">
      {Object.keys(CITIES).map((city) => (
        <option key={city} value={city} />
      ))}
    </datalist>
  )
}

/** Где стоит узел: город (координаты подставятся) или координаты вручную. */
export function RelayLocationForm({ id, region, coords }: { id: string; region: string; coords: string }) {
  const router = useRouter()
  const [regionValue, setRegion] = useState(region)
  const [coordsValue, setCoords] = useState(coords)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await post({ action: 'update', id, region: regionValue, coords: coordsValue })
      router.refresh()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <CityList />
      <input
        value={regionValue}
        onChange={(event) => setRegion(event.target.value)}
        list="relay-cities"
        placeholder="Город, например Москва"
        aria-label="Город"
        className={`${inputClass} flex-[1_1_10rem]`}
      />
      <input
        value={coordsValue}
        onChange={(event) => setCoords(event.target.value)}
        placeholder="или координаты: 55.75, 37.62"
        aria-label="Координаты"
        className={`${inputClass} flex-[1_1_12rem] font-mono`}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Сохранить место'}
      </Button>
      {error && <span className="w-full text-sm text-danger">{error}</span>}
    </form>
  )
}

/** Добавление ретранслятора: после сохранения показывает команду установки. */
export function RelayAddForm() {
  const router = useRouter()
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [coords, setCoords] = useState('')
  const [install, setInstall] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const data = await post({ action: 'add', address, name, region, coords })
      setInstall(data.install ?? '')
      setAddress('')
      setName('')
      setRegion('')
      setCoords('')
      router.refresh()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="relay1.remit.su"
          aria-label="Адрес"
          required
          className={`${inputClass} flex-[2_1_14rem] font-mono`}
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Название"
          aria-label="Название"
          className={`${inputClass} flex-[1_1_9rem]`}
        />
        <CityList />
        <input
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          list="relay-cities"
          placeholder="Город (Москва)"
          aria-label="Город"
          className={`${inputClass} flex-[1_1_9rem]`}
        />
        <input
          value={coords}
          onChange={(event) => setCoords(event.target.value)}
          placeholder="Координаты, если города нет в списке"
          aria-label="Координаты"
          className={`${inputClass} flex-[1_1_12rem] font-mono`}
        />
        <Button type="submit" size="sm" disabled={pending || !address.trim()}>
          {pending ? 'Добавляем…' : 'Добавить'}
        </Button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
      {install && <InstallBlock command={install} />}
    </div>
  )
}

/** Показ команды установки уже добавленного узла. */
export function RelayInstallButton({ id }: { id: string }) {
  const [install, setInstall] = useState('')
  const [error, setError] = useState('')

  if (install) return <InstallBlock command={install} />
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() =>
          post({ action: 'install', id })
            .then((data) => setInstall(data.install ?? ''))
            .catch((reason: Error) => setError(reason.message))
        }
      >
        Команда установки
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
