import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { ButtonLink } from '@/components/ui/button'
import { config } from '@/lib/config'
import { buildPlatforms, detectOs, formatSize } from '@/lib/downloads'
import type { PlatformDownloads } from '@/lib/downloads'
import { getLatestRelease } from '@/lib/updates'
import { formatDate } from '@/lib/time'
import { pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  title: 'Скачать программу удалённого доступа',
  description:
    'Скачайте клиент RemIT для Windows, macOS, Linux, Android и iOS. Портативная версия без установки, серверы уже прописаны в сборке, подключение по ID и паролю.',
  path: '/skachat',
  keywords: [
    'скачать программу удалённого доступа',
    'скачать удалённый рабочий стол',
    'удалённый доступ для windows',
    'клиент удалённого доступа бесплатно',
  ],
})

function PlatformIcon({ path, className = 'size-6' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/** Карточка платформы со всеми вариантами файлов. */
function PlatformCard({ platform, primary }: { platform: PlatformDownloads; primary?: boolean }) {
  return (
    <div className={`card p-5 sm:p-6 ${primary ? 'border-brand-500/35' : ''}`}>
      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-400">
          <PlatformIcon path={platform.icon} />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">{platform.title}</h2>
          <p className="mt-1 text-sm text-text-muted">{platform.note}</p>
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {platform.options.map((option, index) => (
          <li
            key={option.url}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-ink-850/50 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-primary">{option.label}</p>
              <p className="mt-0.5 break-all font-mono text-xs text-text-muted">
                {option.fileName}
                {option.size ? ` · ${formatSize(option.size)}` : ''}
              </p>
            </div>
            <ButtonLink
              href={option.url}
              variant={primary && index === 0 ? 'primary' : 'secondary'}
              size="sm"
              className="w-full sm:w-auto"
            >
              Скачать
            </ButtonLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function DownloadPage() {
  // Если выпуск опубликован в админке, страница раздаёт его файлы.
  const release = await getLatestRelease({ channel: 'stable' })
  const platforms = buildPlatforms(release)

  const detected = detectOs((await headers()).get('user-agent') ?? '')
  const mine = platforms.find((platform) => platform.os === detected)
  const others = platforms.filter((platform) => platform !== mine)

  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-white/8">
          <div className="glow opacity-70" />
          <div className="relative mx-auto max-w-6xl px-5 py-16 text-center">
            <h1 className="text-4xl font-semibold sm:text-5xl">Скачать {config.brand.name}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
              Один файл, никакой регистрации для подключения. Настройки серверов уже зашиты в сборку —
              клиент сразу работает с нашей инфраструктурой.
            </p>
            {release && (
              <p className="mt-4 text-sm text-text-muted">
                Актуальная версия {release.version} · опубликована {formatDate(release.publishedAt)} ·{' '}
                <Link href={`/obnovlenie/${release.version}`} className="text-brand-400 underline decoration-dotted">
                  что изменилось
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-16">
          {mine ? (
            <>
              <p className="mb-4 text-sm text-text-secondary">
                Похоже, у вас {mine.title.split(' ')[0]} — предлагаем эту сборку. Если система другая,
                разверните список ниже.
              </p>
              <PlatformCard platform={mine} primary />
            </>
          ) : (
            <p className="card p-6 text-sm text-text-secondary">
              Для iPhone и iPad отдельной сборки пока нет: подключайтесь с компьютера, а к самим
              мобильным устройствам — через клиент на другой стороне. Сборки для остальных систем
              ниже.
            </p>
          )}

          <details className="group mt-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl border border-white/10 bg-ink-850/50 px-5 py-3.5 text-sm text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary">
              <span>Скачать для другой системы</span>
              <span className="flex items-center gap-2 text-text-muted">
                {others.map((platform) => (
                  <PlatformIcon key={platform.os} path={platform.icon} className="size-4" />
                ))}
                <svg viewBox="0 0 24 24" fill="none" className="size-4 transition-transform group-open:rotate-180">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              {others.map((platform) => (
                <PlatformCard key={platform.os} platform={platform} />
              ))}
            </div>
          </details>

          <div className="card mt-10 p-8">
            <h2 className="text-xl font-semibold">Настройки для ручной конфигурации</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Нужны, если вы используете совместимый клиент или разворачиваете сборку самостоятельно:
              откройте «Настройки → Сеть» и укажите адреса ниже.
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                { term: 'ID-сервер', value: config.rustdesk.idServer },
                { term: 'Сервер-ретранслятор', value: config.rustdesk.relayServer },
                { term: 'API-сервер', value: config.rustdesk.apiServer },
                { term: 'Открытый ключ', value: config.rustdesk.publicKey || 'выдаётся вместе со сборкой' },
              ].map((item) => (
                <div key={item.term} className="rounded-xl border border-white/8 bg-ink-850/60 p-4">
                  <dt className="text-xs uppercase tracking-wider text-text-muted">{item.term}</dt>
                  <dd className="mt-1.5 break-all font-mono text-sm text-text-primary">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {!release && (
            <div className="mt-10 rounded-2xl border border-warning/25 bg-warning/5 p-6">
              <h2 className="font-semibold text-warning">Перед публикацией сборок</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Загрузите сборки в админке (раздел «Обновления») — они лягут на этот сервер, и ссылки на
                этой странице заработают автоматически. Порядок сборки фирменного клиента описан в{' '}
                <code className="font-mono">client/README.md</code> репозитория.
              </p>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
