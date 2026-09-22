import Link from 'next/link'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { JsonLd } from '@/components/seo/json-ld'
import { breadcrumbsJsonLd } from '@/lib/seo'

export interface LegalSection {
  title: string
  paragraphs?: string[]
  list?: string[]
}

/**
 * Общий вид правового документа: заголовок, дата редакции, оглавление и
 * нумерованные разделы. Один компонент на все документы, чтобы они выглядели
 * одинаково и правились в одном месте.
 */
export function LegalPage({
  title,
  path,
  updatedAt,
  intro,
  notice,
  sections,
}: {
  title: string
  path: string
  updatedAt: string
  intro: string
  notice?: string
  sections: LegalSection[]
}) {
  return (
    <>
      <JsonLd
        data={breadcrumbsJsonLd([
          { name: 'Главная', path: '/' },
          { name: 'Документы', path: '/dokumenty' },
          { name: title, path },
        ])}
      />
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <nav className="text-sm text-text-muted">
          <Link href="/dokumenty" className="hover:text-text-primary">
            Документы
          </Link>
        </nav>

        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-text-muted">Редакция от {updatedAt}</p>
        <p className="mt-6 leading-relaxed text-text-secondary">{intro}</p>

        {notice && (
          <div className="mt-6 rounded-2xl border border-warning/25 bg-warning/5 p-5 text-sm leading-relaxed text-text-secondary">
            {notice}
          </div>
        )}

        <ol className="mt-10 space-y-2 rounded-2xl border border-white/8 bg-ink-850/40 p-5 text-sm">
          {sections.map((section, index) => (
            <li key={section.title}>
              <a href={`#p${index + 1}`} className="text-text-secondary hover:text-text-primary">
                {index + 1}. {section.title}
              </a>
            </li>
          ))}
        </ol>

        <div className="mt-10 space-y-10">
          {sections.map((section, index) => (
            <section key={section.title} id={`p${index + 1}`} className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-text-primary">
                {index + 1}. {section.title}
              </h2>
              {section.paragraphs?.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className="mt-3 leading-relaxed text-text-secondary">
                  {paragraph}
                </p>
              ))}
              {section.list && (
                <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-text-secondary">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
