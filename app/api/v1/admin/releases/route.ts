import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { newId } from '@/lib/auth'
import { getStore } from '@/lib/store'
import { compareVersions } from '@/lib/updates'
import { deleteReleaseDir } from '@/lib/storage'
import type { Release, ReleaseFile } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Все выпуски, включая черновики. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const store = await getStore()
  const releases = (await store.listReleases()).sort((a, b) => compareVersions(b.version, a.version))
  return NextResponse.json({ releases })
}

function parseFiles(raw: unknown): ReleaseFile[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const file = item as Record<string, any>
      return {
        os: String(file.os ?? '').trim(),
        arch: String(file.arch ?? '').trim(),
        url: String(file.url ?? '').trim(),
        sha256: String(file.sha256 ?? '').trim(),
        size: Number.parseInt(String(file.size ?? '0'), 10) || 0,
      }
    })
    .filter((file) => file.os && file.url)
}

/**
 * Создание и изменение выпуска. Публикация управляется полем `published`:
 * черновик не попадает ни в проверку обновлений, ни на страницу загрузок.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const store = await getStore()

  const id = String(payload.id ?? '')
  const existing = id ? await store.findRelease(id) : null
  if (id && !existing) return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 })

  const version = String(payload.version ?? existing?.version ?? '').trim()
  if (!/^\d+(\.\d+){1,3}$/.test(version)) {
    return NextResponse.json({ error: 'Версия должна быть вида 1.4.2' }, { status: 400 })
  }

  const channel = String(payload.channel ?? existing?.channel ?? 'stable') === 'beta' ? 'beta' : 'stable'
  const files = payload.files === undefined ? (existing?.files ?? []) : parseFiles(payload.files)
  const published = payload.published === undefined ? (existing?.published ?? false) : Boolean(payload.published)

  if (published && files.length === 0) {
    return NextResponse.json({ error: 'Нельзя опубликовать выпуск без файлов сборки' }, { status: 400 })
  }

  // Версия уникальна внутри канала: иначе клиенты получат разные сборки под одним номером.
  const clash = (await store.listReleases()).find(
    (release) => release.version === version && release.channel === channel && release.id !== existing?.id,
  )
  if (clash) {
    return NextResponse.json({ error: `Версия ${version} в канале ${channel} уже есть` }, { status: 409 })
  }

  const now = new Date().toISOString()
  const release: Release = {
    id: existing?.id ?? newId('rel'),
    version,
    channel,
    notes: String(payload.notes ?? existing?.notes ?? '').slice(0, 5000),
    mandatory: payload.mandatory === undefined ? (existing?.mandatory ?? false) : Boolean(payload.mandatory),
    published,
    files,
    createdAt: existing?.createdAt ?? now,
    publishedAt: published ? (existing?.publishedAt ?? now) : null,
  }

  await store.saveRelease(release)
  return NextResponse.json({ ok: true, release })
}

/** Удаление выпуска. */
export async function DELETE(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'Нужен id выпуска' }, { status: 400 })

  const store = await getStore()
  const release = await store.findRelease(id)
  if (!release) {
    return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 })
  }

  await store.deleteRelease(id)
  // Загруженные в админке файлы этой версии больше не нужны.
  await deleteReleaseDir(release.version)
  return NextResponse.json({ ok: true })
}
