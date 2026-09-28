import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { config } from '@/lib/config'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Лицензии и открытый код',
  description:
    'Какие открытые проекты используются в RemIT, под какими лицензиями и где взять исходный код изменений.',
  path: '/dokumenty/licenzii',
})

const COMPONENTS = [
  {
    name: 'RustDesk',
    license: 'AGPL-3.0',
    role: 'Клиент удалённого доступа: захват экрана, ввод, передача файлов, шифрование сессии.',
    url: 'https://github.com/rustdesk/rustdesk',
  },
  {
    name: 'rustdesk-server (hbbs, hbbr)',
    license: 'AGPL-3.0',
    role: 'Сервер идентификации и ретрансляции. Используем сборку lejianwen/rustdesk-server с проверкой токенов входа.',
    url: 'https://github.com/lejianwen/rustdesk-server',
  },
  {
    name: 'Веб-клиент RustDesk (бета)',
    license: 'AGPL-3.0',
    role: 'Подключение из браузера. Сборка из lejianwen/rustdesk-api; мы отключили в ней аналитику Firebase и загрузку шрифтов напрямую из Google, добавили отметку «бета».',
    url: 'https://github.com/lejianwen/rustdesk-api/tree/master/resources/web',
  },
]

export default function LicensesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-16">
        <h1 className="text-4xl font-semibold">Лицензии и открытый код</h1>
        <p className="mt-4 leading-relaxed text-text-secondary">
          {config.brand.name} построен на открытых проектах. Они распространяются по лицензии AGPL-3.0,
          которая обязывает публиковать исходный код изменённых версий, доступных пользователям по сети.
          Мы соблюдаем это требование: ссылки на репозитории с нашими изменениями опубликованы ниже.
        </p>

        <div className="mt-10 space-y-4">
          {COMPONENTS.map((item) => (
            <div key={item.name} className="card p-6">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-lg font-semibold">{item.name}</h2>
                <span className="pill !py-0.5 !text-xs">{item.license}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.role}</p>
              <a
                href={item.url}
                className="mt-3 inline-block text-sm text-brand-400 underline decoration-dotted"
                rel="noreferrer"
                target="_blank"
              >
                {item.url}
              </a>
            </div>
          ))}
        </div>

        <div className="card mt-10 border-brand-500/30 p-6">
          <h2 className="text-lg font-semibold">Исходный код клиента {config.brand.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Наша сборка — это RustDesk с изменениями: серверы и ключ прописаны внутри программы, свои
            оформление и значок, проверка обновлений на нашем сервере и учёт бесплатного времени. Все
            изменения открыты, текст лицензии AGPL-3.0 входит в установщик и показывается в окне
            «О программе».
          </p>
          <a
            href={config.clientSourceUrl}
            className="mt-3 inline-block text-sm text-brand-400 underline decoration-dotted"
            rel="noreferrer"
            target="_blank"
          >
            {config.clientSourceUrl}
          </a>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
