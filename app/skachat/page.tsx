import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { ButtonLink } from '@/components/ui/button'
import { config } from '@/lib/config'
import { getLatestRelease, pickFile } from '@/lib/updates'
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

/** Из подписи карточки («Windows 10/11») получаем ключ платформы. */
function osKey(title: string): string {
  const value = title.toLowerCase()
  if (value.includes('windows')) return 'windows'
  if (value.includes('mac')) return 'macos'
  if (value.includes('linux')) return 'linux'
  if (value.includes('android')) return 'android'
  return value
}

const BUILDS = [
  {
    os: 'Windows 10/11',
    note: 'Установщик и портативная версия, x64',
    file: 'RemIT-Setup-x64.exe',
    icon: 'M3 5.5 10 4.6v6.4H3zM11.5 4.4 21 3v8h-9.5zM3 12.9h7v6.4L3 18.4zM11.5 12.9H21V21l-9.5-1.4z',
  },
  {
    os: 'macOS 12+',
    note: 'Universal: Apple Silicon и Intel',
    file: 'RemIT.dmg',
    icon: 'M12 7c1-2 3-3 4-3 .2 2-1 4-2 5M7 20c-2-3-3-8 0-10 1.5-1 3 0 4 0s2.5-1 4 0c3 2 2 7 0 10-1 1.5-2 1-3 1s-2 .5-3-1Z',
  },
  {
    os: 'Linux',
    note: 'deb, rpm и AppImage',
    file: 'remit_amd64.deb',
    icon: 'M12 3c3 0 4 3 4 6 0 3 3 5 3 8s-3 4-7 4-7-1-7-4 3-5 3-8c0-3 1-6 4-6Z',
  },
  {
    os: 'Android и iOS',
    note: 'Управление с телефона и планшета',
    file: 'RemIT.apk',
    icon: 'M7 3h10v18H7zM11 18h2',
  },
]

export default async function DownloadPage() {
  // Если выпуск опубликован в админке, страница раздаёт его файлы.
  const release = await getLatestRelease({ channel: 'stable' })

  /** Ссылка на файл из опубликованного выпуска, иначе — на маршрут загрузок. */
  function downloadHref(os: string, fallbackFile: string): string {
    const file = release ? pickFile(release, osKey(os)) : null
    return file?.url ?? `/api/download/${fallbackFile}`
  }

  function fileName(os: string, fallbackFile: string): string {
    const file = release ? pickFile(release, osKey(os)) : null
    if (!file) return fallbackFile
    return file.url.split('/').pop() || fallbackFile
  }

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

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-5 md:grid-cols-2">
            {BUILDS.map((build) => (
              <div
                key={build.os}
                className="card card-hover flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-400">
                    <svg viewBox="0 0 24 24" fill="none" className="size-6">
                      <path d={build.icon} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold">{build.os}</h2>
                    <p className="mt-1 text-sm text-text-muted">
                      {build.note}
                      <span className="block break-all font-mono text-xs sm:inline sm:before:content-['_·_']">
                        {fileName(build.os, build.file)}
                      </span>
                    </p>
                  </div>
                </div>
                <ButtonLink
                  href={downloadHref(build.os, build.file)}
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  Скачать
                </ButtonLink>
              </div>
            ))}
          </div>

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
