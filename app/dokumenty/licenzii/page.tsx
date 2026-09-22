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
    role: 'Сервер идентификации и ретрансляции.',
    url: 'https://github.com/rustdesk/rustdesk-server',
  },
  {
    name: 'lejianwen/rustdesk-api',
    license: 'AGPL-3.0',
    role: 'API и веб-панель: учётные записи, адресная книга, журнал подключений.',
    url: 'https://github.com/lejianwen/rustdesk-api',
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

        <div className="mt-10 rounded-2xl border border-warning/25 bg-warning/5 p-6">
          <h2 className="font-semibold text-warning">Что нужно заполнить перед запуском</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-text-secondary">
            <li>Ссылку на публичный репозиторий с исходным кодом вашей сборки клиента и сервера.</li>
            <li>Текст лицензии AGPL-3.0 в составе дистрибутива клиента.</li>
            <li>Отметку об изменениях: что именно изменено относительно исходного проекта.</li>
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
