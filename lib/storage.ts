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

/* --------------------------------------------------------------------------
 * Снимки экрана к обращениям в поддержку
 *
 * Файл кладём в каталог обращения и раздаём только его автору и поддержке.
 * Тип определяем по первым байтам, а не по имени: имя приходит от браузера,
 * и «скриншот.png» с содержимым html — это способ выполнить чужой скрипт на
 * нашем домене. SVG не принимаем по той же причине: это исполняемый формат.
 * ------------------------------------------------------------------------ */

/** Что принимаем: обычные снимки экрана и фотографии. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
}

export const ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic'

function bytesAt(data: Uint8Array, offset: number, signature: number[]): boolean {
  return signature.every((byte, index) => data[offset + index] === byte)
}

function ascii(data: Uint8Array, offset: number, text: string): boolean {
  return bytesAt(data, offset, [...text].map((char) => char.charCodeAt(0)))
}

/**
 * Определяет формат по сигнатуре. Возвращает расширение из ATTACHMENT_TYPES
 * или пустую строку, если это не картинка известного формата.
 */
export function sniffImageKind(data: Uint8Array): string {
  if (bytesAt(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (bytesAt(data, 0, [0xff, 0xd8, 0xff])) return 'jpg'
  if (ascii(data, 0, 'GIF87a') || ascii(data, 0, 'GIF89a')) return 'gif'
  if (ascii(data, 0, 'RIFF') && ascii(data, 8, 'WEBP')) return 'webp'
  // HEIC: контейнер ISO-BMFF, тип лежит в боксе ftyp сразу после длины.
  if (ascii(data, 4, 'ftyp')) {
    const brand = String.fromCharCode(...data.slice(8, 12))
    if (['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic'
  }
  return ''
}

/** Идентификатор обращения используется как имя каталога — проверяем строго. */
function isSafeTicketId(ticketId: string): boolean {
  return /^ticket_[a-z0-9]{1,40}$/.test(ticketId)
}

function attachmentsRoot(): string {
  const dir = config.storage.attachmentsDir
  return dir.startsWith('/') ? dir : `${process.cwd()}/${dir}`
}

export function attachmentPath(ticketId: string, fileName: string): string | null {
  if (!isSafeTicketId(ticketId)) return null
  const name = safeFileName(fileName)
  if (!name || name === '.' || name === '..') return null
  return `${attachmentsRoot()}/${ticketId}/${name}`
}

export function attachmentUrl(ticketId: string, fileName: string): string {
  return `/api/v1/support/attachments/${encodeURIComponent(ticketId)}/${encodeURIComponent(
    safeFileName(fileName),
  )}`
}

export interface StoredAttachment {
  name: string
  url: string
  size: number
  contentType: string
}

/**
 * Сохраняет снимок экрана. Имя файла задаём сами — по порядковому номеру и
 * настоящему формату: тогда ни расширение, ни кириллица из имени, выбранного
 * пользователем, ни при чём.
 */
export async function storeAttachment(
  ticketId: string,
  index: number,
  data: Uint8Array,
): Promise<StoredAttachment | null> {
  const kind = sniffImageKind(data)
  if (!kind) return null

  const name = `${index + 1}.${kind}`
  const target = attachmentPath(ticketId, name)
  if (!target) return null

  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, data)

  return { name, url: attachmentUrl(ticketId, name), size: data.length, contentType: ATTACHMENT_TYPES[kind] }
}

export async function statAttachment(
  ticketId: string,
  fileName: string,
): Promise<{ path: string; size: number } | null> {
  const target = attachmentPath(ticketId, fileName)
  if (!target) return null
  try {
    const stat = await fs.stat(target)
    return stat.isFile() ? { path: target, size: stat.size } : null
  } catch {
    return null
  }
}

/**
 * Отдаёт картинку для показа прямо на странице. Тип берём из имени файла,
 * которое мы же и присвоили по сигнатуре, и запрещаем браузеру угадывать
 * его заново.
 */
export function streamAttachment(filePath: string, fileName: string, size: number, method = 'GET'): Response {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const headers: Record<string, string> = {
    'content-type': ATTACHMENT_TYPES[extension] ?? 'application/octet-stream',
    'content-length': String(size),
    'content-disposition': `inline; filename="${fileName}"`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    // Личный файл: ни общий кеш, ни поисковики его видеть не должны.
    'cache-control': 'private, max-age=600',
  }

  if (method === 'HEAD') return new Response(null, { status: 200, headers })

  const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream
  return new Response(stream, { status: 200, headers })
}
