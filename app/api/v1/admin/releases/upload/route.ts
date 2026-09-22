import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { config } from '@/lib/config'
import { isSafeVersion, storeReleaseFile } from '@/lib/storage'

export const dynamic = 'force-dynamic'
// Загрузка идёт потоком на диск, поэтому таймаут больше обычного.
export const maxDuration = 600

/**
 * Загрузка сборки в хранилище сайта.
 *
 * PUT /api/v1/admin/releases/upload?version=1.4.2&name=RemIT-1.4.2-x64.exe
 * Тело запроса — сам файл. Ответ: адрес, размер и SHA-256, которые сразу
 * подставляются в карточку выпуска.
 */
export async function PUT(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const url = new URL(request.url)
  const version = url.searchParams.get('version') ?? ''
  const name = url.searchParams.get('name') ?? ''

  if (!isSafeVersion(version)) {
    return NextResponse.json({ error: 'Сначала укажите версию выпуска, например 1.4.2' }, { status: 400 })
  }
  if (!name.trim()) {
    return NextResponse.json({ error: 'Не передано имя файла' }, { status: 400 })
  }
  if (!request.body) {
    return NextResponse.json({ error: 'Пустое тело запроса' }, { status: 400 })
  }

  const declaredSize = Number.parseInt(request.headers.get('content-length') ?? '0', 10)
  if (declaredSize > config.storage.maxUploadBytes) {
    const limit = Math.round(config.storage.maxUploadBytes / (1024 * 1024))
    return NextResponse.json({ error: `Файл больше ${limit} МБ` }, { status: 413 })
  }

  try {
    const stored = await storeReleaseFile(version, name, request.body)
    return NextResponse.json({ ok: true, ...stored })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сохранить файл'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
