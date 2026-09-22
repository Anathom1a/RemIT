import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { compareVersions, getLatestRelease, pickFile } from '@/lib/updates'

export const dynamic = 'force-dynamic'

/**
 * Развёрнутая проверка обновлений — для установщиков, скриптов и фирменного
 * клиента: сразу отдаёт прямую ссылку, контрольную сумму и заметки к выпуску.
 *
 * GET /api/v1/updates/check?os=windows&arch=x86_64&version=1.4.0&channel=stable
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const os = url.searchParams.get('os') ?? ''
  const arch = url.searchParams.get('arch') ?? ''
  const channel = url.searchParams.get('channel') ?? 'stable'
  const current = url.searchParams.get('version') ?? ''

  const release = await getLatestRelease({ os, channel })
  if (!release) {
    return NextResponse.json({ updateAvailable: false, reason: 'no_release' })
  }

  const file = os ? pickFile(release, os, arch) : null
  const updateAvailable = current ? compareVersions(release.version, current) > 0 : true
  const base = config.rustdesk.apiServer.replace(/\/$/, '') || `https://${config.brand.domain}`

  return NextResponse.json({
    updateAvailable,
    version: release.version,
    channel: release.channel,
    mandatory: release.mandatory,
    notes: release.notes,
    publishedAt: release.publishedAt,
    pageUrl: `${base}/obnovlenie/${release.version}`,
    download: file
      ? { url: file.url, os: file.os, arch: file.arch, sha256: file.sha256, size: file.size }
      : null,
  })
}
