import { NextResponse } from 'next/server'
import { getStore } from '@/lib/store'
import { compareVersions } from '@/lib/updates'

export const dynamic = 'force-dynamic'

/** Список опубликованных выпусков: для страницы загрузок и внешних скриптов. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const channel = url.searchParams.get('channel')

  const store = await getStore()
  const releases = (await store.listReleases())
    .filter((release) => release.published)
    .filter((release) => !channel || release.channel === channel)
    .sort((a, b) => compareVersions(b.version, a.version))
    .map((release) => ({
      version: release.version,
      channel: release.channel,
      mandatory: release.mandatory,
      notes: release.notes,
      publishedAt: release.publishedAt,
      files: release.files,
    }))

  return NextResponse.json({ releases })
}
