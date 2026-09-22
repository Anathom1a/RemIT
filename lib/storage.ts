import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { config } from './config'

/**
 * Хранилище сборок клиента на нашем сервере: админ загружает файл, сайт
 * раздаёт его по своему адресу. Внешнее хранилище остаётся возможным —
 * в выпуске можно указать и обычную ссылку.
 */

/** Имя файла без путей и сюрпризов: только то, что безопасно положить на диск. */
export function safeFileName(raw: string): string {
  const base = path.basename(raw.trim()).replace(/[^A-Za-z0-9._-]/g, '_')
  return base.slice(0, 120) || 'file'
}

/** Версия используется как имя каталога, поэтому проверяем её строго. */
export function isSafeVersion(version: string): boolean {
  return /^\d+(\.\d+){1,3}$/.test(version)
}

function releasesRoot(): string {
  // Без path.resolve от переменной: иначе сборщик решает, что мы читаем весь
  // проект, и тянет его целиком в трассировку standalone-сборки.
  const dir = config.storage.releasesDir
  return dir.startsWith('/') ? dir : `${process.cwd()}/${dir}`
}

/**
 * Абсолютный путь файла выпуска. Обе части пути заранее проверены:
 * версия — только цифры и точки, имя файла — только безопасные символы,
 * поэтому выйти за пределы каталога нечем.
 */
export function releaseFilePath(version: string, fileName: string): string | null {
  if (!isSafeVersion(version)) return null
  const name = safeFileName(fileName)
  if (!name || name === '.' || name === '..') return null
  return `${releasesRoot()}/${version}/${name}`
}

/** Публичный адрес загруженного файла. */
export function releaseFileUrl(version: string, fileName: string): string {
  return `/api/download/${encodeURIComponent(version)}/${encodeURIComponent(safeFileName(fileName))}`
}

export interface StoredFile {
  fileName: string
  url: string
  size: number
  sha256: string
}

/**
 * Пишет поток в файл выпуска, попутно считая размер и контрольную сумму.
 * Файл сначала пишется во временный, затем переименовывается: недокачанная
 * сборка не должна попасть к клиентам.
 */
export async function storeReleaseFile(
  version: string,
  fileName: string,
  body: ReadableStream<Uint8Array>,
): Promise<StoredFile> {
  const target = releaseFilePath(version, fileName)
  if (!target) throw new Error('Некорректная версия или имя файла')

  await fs.mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.part`

  const hash = createHash('sha256')
  let size = 0
  const source = Readable.fromWeb(body as any)
  source.on('data', (chunk: Buffer) => {
    size += chunk.length
    hash.update(chunk)
    if (size > config.storage.maxUploadBytes) {
      source.destroy(new Error('Файл больше допустимого размера'))
    }
  })

  try {
    await pipeline(source, createWriteStream(temporary))
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }

  await fs.rename(temporary, target)

  return {
    fileName: safeFileName(fileName),
    url: releaseFileUrl(version, fileName),
    size,
    sha256: hash.digest('hex'),
  }
}

export async function statReleaseFile(
  version: string,
  fileName: string,
): Promise<{ path: string; size: number } | null> {
  const target = releaseFilePath(version, fileName)
  if (!target) return null
  try {
    const stat = await fs.stat(target)
    return stat.isFile() ? { path: target, size: stat.size } : null
  } catch {
    return null
  }
}

export async function deleteReleaseFile(version: string, fileName: string): Promise<void> {
  const target = releaseFilePath(version, fileName)
  if (!target) return
  await fs.rm(target, { force: true })
}

/** Удаляет каталог версии целиком — вместе с удалением выпуска. */
export async function deleteReleaseDir(version: string): Promise<void> {
  if (!isSafeVersion(version)) return
  await fs.rm(`${releasesRoot()}/${version}`, { recursive: true, force: true })
}

const CONTENT_TYPES: Record<string, string> = {
  exe: 'application/vnd.microsoft.portable-executable',
  msi: 'application/x-msi',
  dmg: 'application/x-apple-diskimage',
  deb: 'application/vnd.debian.binary-package',
  rpm: 'application/x-rpm',
  apk: 'application/vnd.android.package-archive',
  appimage: 'application/x-executable',
  zip: 'application/zip',
}

export function contentTypeFor(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

/** Отдаёт файл потоком, не загружая его целиком в память. */
export function streamFile(filePath: string, fileName: string, size: number, method = 'GET'): Response {
  const headers: Record<string, string> = {
    'content-type': contentTypeFor(fileName),
    'content-length': String(size),
    'content-disposition': `attachment; filename="${fileName}"`,
    'cache-control': 'public, max-age=86400',
  }

  if (method === 'HEAD') return new Response(null, { status: 200, headers })

  const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream
  return new Response(stream, { status: 200, headers })
}
