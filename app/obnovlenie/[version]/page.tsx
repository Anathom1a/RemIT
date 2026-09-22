import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { ButtonLink } from '@/components/ui/button'
import { getStore } from '@/lib/store'
import { formatDate } from '@/lib/time'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

const OS_TITLES: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string }>
}): Promise<Metadata> {
  const { version } = await params
  return { title: `Обновление ${version}` }
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`
}

/**
 * Страница выпуска. Именно её открывает клиент, когда сервер обновлений
 * сообщает о новой версии: адрес заканчивается номером версии, по нему клиент
 * и понимает, что обновление есть.
 */
export default async function ReleasePage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params
  const store = await getStore()
  const release = (await store.listReleases()).find(
    (item) => item.version === decodeURIComponent(version) && item.published,
  )

  if (!release) notFound()

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {config.brand.name} {release.version}
          </h1>
          {release.channel === 'beta' && <span className="pill !py-1 !text-xs">бета</span>}
          {release.mandatory && (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning">
              обязательное обновление
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-text-muted">Опубликовано {formatDate(release.publishedAt)}</p>

        {release.notes && (
          <div className="card mt-8 p-6">
            <h2 className="font-semibold">Что изменилось</h2>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-text-secondary">
              {release.notes.split('\n').map((line, index) =>
                line.trim() ? <p key={index}>{line}</p> : null,
              )}
            </div>
          </div>
        )}

        <h2 className="mt-10 text-xl font-semibold">Загрузки</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {release.files.map((file) => (
            <div key={`${file.os}-${file.arch}-${file.url}`} className="card p-5">
              <h3 className="font-semibold">
                {OS_TITLES[file.os.toLowerCase()] ?? file.os}
                {file.arch && <span className="ml-2 text-sm text-text-muted">{file.arch}</span>}
              </h3>
              {file.size > 0 && <p className="mt-1 text-sm text-text-muted">{formatSize(file.size)}</p>}
              {file.sha256 && (
                <p className="mt-2 break-all font-mono text-[11px] text-text-muted">SHA-256: {file.sha256}</p>
              )}
              <ButtonLink href={file.url} className="mt-4 w-full">
                Скачать
              </ButtonLink>
            </div>
          ))}
        </div>

        <div className="card mt-10 p-6">
          <h2 className="font-semibold">Как обновиться</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-text-secondary">
            <li>Скачайте файл для своей системы и запустите установку поверх текущей версии.</li>
            <li>Настройки, пароли и адресная книга сохранятся — переносить ничего не нужно.</li>
            <li>Если {config.brand.name} установлен как служба, она перезапустится автоматически.</li>
          </ol>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
