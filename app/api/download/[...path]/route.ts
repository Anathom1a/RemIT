import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { statReleaseFile, streamFile } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * Раздача сборок клиента.
 *
 *   /api/download/1.4.2/RemIT-1.4.2-x64.exe — файл, загруженный в админке;
 *   /api/download/<имя файла>                   — запасной вариант: внешнее
 *                                                 хранилище, если оно задано.
 */
async function handle(request: Request, segments: string[], method: 'GET' | 'HEAD') {
  const clean = segments.map((segment) => decodeURIComponent(segment))

  if (clean.some((segment) => segment.includes('..') || segment.includes('/'))) {
    return NextResponse.json({ error: 'Некорректный путь' }, { status: 400 })
  }

  if (clean.length === 2) {
    const [version, fileName] = clean
    const found = await statReleaseFile(version, fileName)
    if (found) return streamFile(found.path, fileName, found.size, method)
  }

  const base = config.storage.downloadsBase
  if (base) {
    return NextResponse.redirect(`${base.replace(/\/$/, '')}/${clean.join('/')}`, 302)
  }

  return NextResponse.json(
    {
      error: 'Файл не найден',
      hint: `Загрузите сборку в админке (раздел «Обновления») — она будет раздаваться отсюда. Поддержка: ${config.brand.supportUrl}`,
    },
    { status: 404 },
  )
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handle(request, path, 'GET')
}

export async function HEAD(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handle(request, path, 'HEAD')
}
