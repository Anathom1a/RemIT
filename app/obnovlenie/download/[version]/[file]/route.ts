import { NextResponse } from 'next/server'
import { getStore } from '@/lib/store'
import { resolveDownload } from '@/lib/updates'
import { statReleaseFile, streamFile } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * Каталог загрузки выпуска. Клиент сам собирает имя файла сборки
 * (`rustdesk-1.4.2-x86_64.exe`) и скачивает его отсюда — мы находим
 * подходящий файл выпуска и перенаправляем на хранилище.
 *
 * HEAD поддерживается специально: перед докачкой клиент сравнивает размер
 * уже скачанного файла с размером на сервере.
 */
async function resolve(version: string, file: string) {
  const store = await getStore()
  const release = (await store.listReleases()).find(
    (item) => item.version === decodeURIComponent(version) && item.published,
  )
  if (!release) return null
  return resolveDownload(release, decodeURIComponent(file))
}

/** Имя файла в нашем хранилище, если выпуск раздаётся с сайта. */
function localFileName(url: string): string | null {
  const match = /^\/api\/download\/[^/]+\/([^/?#]+)$/.exec(url)
  return match ? decodeURIComponent(match[1]) : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ version: string; file: string }> },
) {
  const { version, file } = await params
  const target = await resolve(version, file)
  if (!target) {
    return NextResponse.json({ error: 'Файл выпуска не найден' }, { status: 404 })
  }

  const local = localFileName(target.url)
  if (local) {
    const found = await statReleaseFile(decodeURIComponent(version), local)
    if (found) return streamFile(found.path, local, found.size, 'GET')
  }

  return NextResponse.redirect(new URL(target.url, request.url), 302)
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ version: string; file: string }> },
) {
  const { version, file } = await params
  const target = await resolve(version, file)
  if (!target) return new Response(null, { status: 404 })

  const local = localFileName(target.url)
  if (local) {
    const found = await statReleaseFile(decodeURIComponent(version), local)
    if (found) return streamFile(found.path, local, found.size, 'HEAD')
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: new URL(target.url, request.url).toString(),
      ...(target.size > 0 ? { 'content-length': String(target.size) } : {}),
    },
  })
}
