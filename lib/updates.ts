import { getStore } from './store'
import type { Release, ReleaseFile } from './types'

/**
 * Сервер обновлений: какой выпуск считать последним для конкретной платформы
 * и как сравнивать версии так же, как это делает клиент.
 */

/** Разбирает «1.4.2» в набор чисел; лишние символы игнорируются. */
function parseVersion(value: string): number[] {
  return value
    .split(/[^0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
}

/** -1, 0 или 1 — как обычный компаратор. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference > 0 ? 1 : -1
  }
  return 0
}

const LINUX_IDS = new Set([
  'linux',
  'ubuntu',
  'debian',
  'fedora',
  'arch',
  'manjaro',
  'opensuse',
  'centos',
  'rhel',
  'alt',
  'astra',
  'redos',
])

/**
 * Клиент присылает идентификатор дистрибутива (`ubuntu`, `astra`, `windows`),
 * а сборки мы храним по семействам ОС.
 */
export function normalizeOs(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value) return ''
  if (value.includes('windows') || value === 'win') return 'windows'
  if (value.includes('mac') || value === 'darwin' || value === 'ios') {
    return value === 'ios' ? 'ios' : 'macos'
  }
  if (value.includes('android')) return 'android'
  if (LINUX_IDS.has(value) || value.includes('linux')) return 'linux'
  return value
}

/** Последний опубликованный выпуск в канале, при необходимости — с файлом под ОС. */
export async function getLatestRelease(options: {
  os?: string
  channel?: string
} = {}): Promise<Release | null> {
  const store = await getStore()
  const channel = options.channel === 'beta' ? 'beta' : 'stable'
  const os = options.os ? normalizeOs(options.os) : ''

  const candidates = (await store.listReleases())
    .filter((release) => release.published)
    // В канале beta показываем и стабильные выпуски: они новее по определению.
    .filter((release) => (channel === 'beta' ? true : release.channel === 'stable'))
    .filter((release) => !os || release.files.some((file) => normalizeOs(file.os) === os))
    .sort((a, b) => compareVersions(b.version, a.version))

  return candidates[0] ?? null
}

/** Файл сборки под платформу: сначала точное совпадение архитектуры, потом любое. */
export function pickFile(release: Release, os: string, arch = ''): ReleaseFile | null {
  const target = normalizeOs(os)
  const files = release.files.filter((file) => normalizeOs(file.os) === target)
  if (files.length === 0) return null
  const wanted = arch.trim().toLowerCase()
  const exact = files.find((file) => file.arch.trim().toLowerCase() === wanted)
  return exact ?? files[0]
}

const EXTENSION_OS: Record<string, string> = {
  exe: 'windows',
  msi: 'windows',
  dmg: 'macos',
  pkg: 'macos',
  deb: 'linux',
  rpm: 'linux',
  appimage: 'linux',
  apk: 'android',
}

/** x64 и x86_64 — одно и то же, arm64 и aarch64 тоже. */
function normalizeArch(value: string): string {
  const arch = value.trim().toLowerCase()
  if (arch === 'x64' || arch === 'amd64') return 'x86_64'
  if (arch === 'arm64') return 'aarch64'
  return arch
}

const KNOWN_ARCHS = ['x86_64', 'x64', 'amd64', 'aarch64', 'arm64', 'armv7', 'i386', 'x86']

/**
 * Клиент сам собирает имя файла сборки вида `rustdesk-1.4.2-x86_64.exe`
 * и скачивает его из каталога выпуска. Здесь по такому имени находим,
 * какой именно файл выпуска ему отдать.
 */
export function resolveDownload(release: Release, requestedFile: string): ReleaseFile | null {
  const name = requestedFile.trim().toLowerCase()
  if (!name) return null

  const extension = name.split('.').pop() ?? ''
  const os = EXTENSION_OS[extension] ?? ''
  const arch = normalizeArch(KNOWN_ARCHS.find((candidate) => name.includes(candidate)) ?? '')

  const sameOs = release.files.filter((file) => (os ? normalizeOs(file.os) === os : true))
  if (sameOs.length === 0) return null

  // Сначала точное совпадение расширения и архитектуры, затем менее строгие варианты.
  const byExtension = sameOs.filter((file) => file.url.toLowerCase().endsWith(`.${extension}`))
  const pool = byExtension.length > 0 ? byExtension : sameOs
  const byArch = arch ? pool.filter((file) => normalizeArch(file.arch) === arch) : []

  return byArch[0] ?? pool[0] ?? null
}
