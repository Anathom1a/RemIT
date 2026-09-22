import { normalizeOs } from './updates'
import type { Release } from './types'

/**
 * Что предлагать на странице загрузки.
 *
 * Систему посетителя определяем на сервере по User-Agent: страница и так
 * динамическая, а так нужная кнопка видна сразу, без мигания после загрузки
 * скриптов и без вопроса «а какая у вас система».
 */

export type OsKey = 'windows' | 'macos' | 'linux' | 'android' | 'ios'

export interface DownloadOption {
  /** Подпись кнопки: «Установщик (.exe)», «Пакет .deb» и так далее. */
  label: string
  fileName: string
  url: string
  size: number
}

export interface PlatformDownloads {
  os: OsKey
  title: string
  note: string
  icon: string
  options: DownloadOption[]
}

/** Порядок важен: он же определяет, что показывать под спойлером. */
export const PLATFORMS: {
  os: OsKey
  title: string
  note: string
  icon: string
  fallback: { label: string; fileName: string }[]
}[] = [
  {
    os: 'windows',
    title: 'Windows 10/11',
    note: 'Портативная версия и установщик MSI, x64',
    icon: 'M3 5.5 10 4.6v6.4H3zM11.5 4.4 21 3v8h-9.5zM3 12.9h7v6.4L3 18.4zM11.5 12.9H21V21l-9.5-1.4z',
    fallback: [
      { label: 'Портативная версия (.exe)', fileName: 'RemIT-Setup-x64.exe' },
      { label: 'Установщик MSI', fileName: 'RemIT-x64.msi' },
    ],
  },
  {
    os: 'macos',
    title: 'macOS 12+',
    note: 'Отдельные сборки для Apple Silicon и Intel',
    icon: 'M12 7c1-2 3-3 4-3 .2 2-1 4-2 5M7 20c-2-3-3-8 0-10 1.5-1 3 0 4 0s2.5-1 4 0c3 2 2 7 0 10-1 1.5-2 1-3 1s-2 .5-3-1Z',
    fallback: [{ label: 'Образ диска (.dmg)', fileName: 'RemIT.dmg' }],
  },
  {
    os: 'linux',
    title: 'Linux',
    note: 'deb, rpm и AppImage, x86_64',
    icon: 'M12 3c3 0 4 3 4 6 0 3 3 5 3 8s-3 4-7 4-7-1-7-4 3-5 3-8c0-3 1-6 4-6Z',
    fallback: [{ label: 'Пакет .deb', fileName: 'remit_amd64.deb' }],
  },
  {
    os: 'android',
    title: 'Android',
    note: 'Управление с телефона и планшета',
    icon: 'M7 3h10v18H7zM11 18h2',
    fallback: [{ label: 'Пакет .apk', fileName: 'RemIT.apk' }],
  },
]

/** Система посетителя по User-Agent. Не угадали — считаем, что Windows. */
export function detectOs(userAgent: string): OsKey {
  const value = userAgent.toLowerCase()
  // Android проверяем раньше Linux: в его User-Agent есть оба слова.
  if (value.includes('android')) return 'android'
  if (/iphone|ipad|ipod/.test(value)) return 'ios'
  // «Windows NT» — обычный десктоп, «Windows Phone» сюда не относится.
  if (value.includes('windows nt')) return 'windows'
  if (value.includes('mac os x') || value.includes('macintosh')) return 'macos'
  if (value.includes('linux') || value.includes('x11')) return 'linux'
  return 'windows'
}

const EXTENSION_LABELS: Record<string, string> = {
  exe: 'Портативная версия (.exe)',
  msi: 'Установщик MSI',
  dmg: 'Образ диска (.dmg)',
  pkg: 'Установщик (.pkg)',
  deb: 'Пакет .deb (Debian, Ubuntu, Astra)',
  rpm: 'Пакет .rpm (Fedora, РЕД ОС, Альт)',
  appimage: 'AppImage (любой дистрибутив)',
  apk: 'Пакет .apk',
}

/** Человеческое название архитектуры; для x86_64 ничего не дописываем. */
function archSuffix(arch: string): string {
  const value = arch.trim().toLowerCase()
  if (!value || value === 'x86_64' || value === 'x64' || value === 'amd64') return ''
  if (value === 'aarch64' || value === 'arm64') return ' · Apple Silicon и ARM'
  return ` · ${arch}`
}

export function formatSize(bytes: number): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`
}

/**
 * Собирает список вариантов загрузки для каждой платформы. Пока выпуск не
 * опубликован, показываем ожидаемые имена файлов: ссылка ведёт на маршрут
 * загрузок и честно отвечает, что файла ещё нет.
 */
export function buildPlatforms(release: Release | null): PlatformDownloads[] {
  return PLATFORMS.map((platform) => {
    const files = (release?.files ?? []).filter((file) => normalizeOs(file.os) === platform.os)

    const options: DownloadOption[] = files.map((file) => {
      const fileName = decodeURIComponent(file.url.split('/').pop() || '')
      const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
      return {
        label: (EXTENSION_LABELS[extension] ?? `Файл .${extension}`) + archSuffix(file.arch),
        fileName,
        url: file.url,
        size: file.size,
      }
    })

    return {
      os: platform.os,
      title: platform.title,
      note: platform.note,
      icon: platform.icon,
      options:
        options.length > 0
          ? options
          : platform.fallback.map((item) => ({
              label: item.label,
              fileName: item.fileName,
              url: `/api/download/${item.fileName}`,
              size: 0,
            })),
    }
  })
}
