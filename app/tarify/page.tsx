import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { PricingTable } from '@/components/site/pricing-table'
import { FAQ_ITEMS, Faq } from '@/components/site/faq'
import { JsonLd } from '@/components/seo/json-ld'
import { ButtonLink } from '@/components/ui/button'
import { config } from '@/lib/config'
import { formatPrice, getPlan } from '@/lib/plans'
import { breadcrumbsJsonLd, faqJsonLd, pageMetadata, softwareJsonLd } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: `Тарифы: удалённый доступ от ${formatPrice(getPlan('start').priceMonthly)} в месяц`,
  description:
    `Тарифы RemIT: бесплатно 3 часа удалённого управления в сутки, платные тарифы от ${formatPrice(getPlan('start').priceMonthly)} в месяц без ограничения по времени. ` +
    'Компаниям — пробный период до 30 дней и оплата по счёту.',
  path: '/tarify',
  keywords: [
    'тарифы удалённого доступа',
    'удалённый доступ цена',
    'стоимость удалённого рабочего стола',
    'удалённый доступ по подписке',
  ],
})

interface PlanColumn {
  key: 'free' | 'start' | 'pro' | 'business' | 'corporate'
  title: string
  highlighted?: boolean
}

const PLAN_COLUMNS: PlanColumn[] = [
  { key: 'free', title: 'Бесплатный' },
  { key: 'start', title: 'Старт' },
  { key: 'pro', title: 'Профи', highlighted: true },
  { key: 'business', title: 'Бизнес' },
  { key: 'corporate', title: 'Корпоративный' },
]

const COMPARE = [
  { feature: 'Время управления в сутки', free: '3 часа', start: 'без лимита', pro: 'без лимита', business: 'без лимита', corporate: 'без лимита' },
  { feature: 'Одновременные сессии', free: '1', start: '1', pro: '3', business: '10', corporate: 'сколько нужно' },
  { feature: 'Устройств в адресной книге', free: '3', start: '10', pro: '100', business: 'без лимита', corporate: 'без лимита' },
  { feature: 'Неподтверждённый доступ', free: '—', start: 'да', pro: 'да', business: 'да', corporate: 'да' },
  { feature: 'История подключений', free: '7 дней', start: '30 дней', pro: '180 дней', business: '365 дней', corporate: '365 дней' },
  { feature: 'Общая адресная книга', free: '—', start: '—', pro: '—', business: 'да', corporate: 'да' },
  { feature: 'Оплата по счёту и документы', free: '—', start: '—', pro: 'да', business: 'да', corporate: 'да' },
  { feature: 'Поддержка', free: 'база знаний', start: 'Telegram', pro: 'приоритет', business: 'менеджер', corporate: 'менеджер' },
]

export default function PricingPage() {
  const start = getPlan('start')

  return (
    <>
      <JsonLd
        data={[
          softwareJsonLd(),
          faqJsonLd(FAQ_ITEMS.map((item) => ({ question: item.q, answer: item.a }))),
          breadcrumbsJsonLd([
            { name: 'Главная', path: '/' },
            { name: 'Тарифы', path: '/tarify' },
          ]),
        ]}
      />
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-white/8">
          <div className="glow opacity-70" />
          <div className="relative mx-auto max-w-6xl px-5 py-16 text-center">
            <h1 className="text-[2rem] font-semibold leading-[1.12] sm:text-5xl">
              Тарифы: от {formatPrice(start.priceMonthly)} в месяц
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
              Бесплатный тариф — 3 часа активного управления в сутки, без ограничения по числу подключений.
              Подписка снимает лимит времени и добавляет одновременные сессии. Организациям — пробный период
              до {config.trial.maxDays} дней и оплата по счёту.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/probnyy-period">Пробный период для компании</ButtonLink>
              <ButtonLink href="/sravnenie" variant="secondary">
                Посчитать экономию
              </ButtonLink>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <PricingTable />
        </section>

        <section className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold sm:text-3xl">Подробное сравнение</h2>
            {/* Телефон: сравнение по тарифам, чтобы не листать таблицу вбок */}
            <div className="mt-8 space-y-4 md:hidden">
              {PLAN_COLUMNS.map((column) => (
                <div key={column.key} className="card p-5">
                  <h3 className={`font-semibold ${column.highlighted ? 'text-brand-400' : ''}`}>{column.title}</h3>
                  <dl className="mt-3 space-y-2">
                    {COMPARE.map((row) => (
                      <div key={row.feature} className="flex items-baseline justify-between gap-3 text-sm">
                        <dt className="text-text-muted">{row.feature}</dt>
                        <dd className="text-right text-text-secondary">{row[column.key]}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>

            <div className="mt-8 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-text-muted">
                    <th className="pb-4 pr-4 font-medium">Возможность</th>
                    <th className="pb-4 pr-4 font-medium">Бесплатный</th>
                    <th className="pb-4 pr-4 font-medium">Старт</th>
                    <th className="pb-4 pr-4 font-medium text-brand-400">Профи</th>
                    <th className="pb-4 pr-4 font-medium">Бизнес</th>
                    <th className="pb-4 font-medium">Корпоративный</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row) => (
                    <tr key={row.feature} className="border-t border-white/8">
                      <td className="py-3.5 pr-4 text-text-secondary">{row.feature}</td>
                      <td className="py-3.5 pr-4">{row.free}</td>
                      <td className="py-3.5 pr-4">{row.start}</td>
                      <td className="py-3.5 pr-4 text-brand-400">{row.pro}</td>
                      <td className="py-3.5 pr-4">{row.business}</td>
                      <td className="py-3.5">{row.corporate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-sm text-text-muted">
              Нужна конфигурация под ваш контур или выделенный сервер? Напишите в поддержку:{' '}
              <a href={config.brand.supportUrl} className="text-brand-400 underline decoration-dotted">
                {config.brand.supportUrl}
              </a>
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="mb-8 text-center text-2xl font-semibold sm:text-3xl">Вопросы об оплате и лимите</h2>
          <Faq />
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
