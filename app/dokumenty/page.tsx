import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { pageMetadata } from '@/lib/seo'
import { config } from '@/lib/config'

export const metadata: Metadata = pageMetadata({
  title: 'Документы',
  description:
    'Правовые документы сервиса RemIT: публичная оферта, пользовательское соглашение, политика конфиденциальности, согласие на обработку персональных данных, cookie и лицензии.',
  path: '/dokumenty',
})

const DOCUMENTS = [
  {
    href: '/dokumenty/oferta',
    title: 'Публичная оферта',
    text: 'Условия оказания услуг, тарифы, порядок оплаты и возврата средств.',
  },
  {
    href: '/dokumenty/soglashenie',
    title: 'Пользовательское соглашение',
    text: 'Правила использования сервиса, запреты, ответственность сторон и порядок блокировки.',
  },
  {
    href: '/dokumenty/politika',
    title: 'Политика конфиденциальности',
    text: 'Какие данные обрабатываются, зачем, где хранятся и как их удалить.',
  },
  {
    href: '/dokumenty/soglasie',
    title: 'Согласие на обработку персональных данных',
    text: 'Текст согласия, которое пользователь даёт при регистрации и отправке заявок.',
  },
  {
    href: '/dokumenty/cookie',
    title: 'Политика использования cookie',
    text: 'Какие файлы cookie использует сайт и как ими управлять.',
  },
  {
    href: '/dokumenty/licenzii',
    title: 'Лицензии и открытый код',
    text: 'Открытые проекты в основе сервиса и ссылки на исходный код изменений.',
  },
]

export default function DocumentsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold sm:text-4xl">Документы</h1>
        <p className="mt-4 leading-relaxed text-text-secondary">
          Здесь собраны правовые документы сервиса. Если нужен подписанный экземпляр договора или счёт на
          организацию, напишите на{' '}
          <a href={`mailto:${config.brand.salesEmail}`} className="text-brand-400 underline decoration-dotted">
            {config.brand.salesEmail}
          </a>
          .
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {DOCUMENTS.map((document) => (
            <Link key={document.href} href={document.href} className="card card-hover block p-6">
              <h2 className="font-semibold">{document.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{document.text}</p>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
