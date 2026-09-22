import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { SavingsCalculator } from '@/components/site/savings-calculator'
import { JsonLd } from '@/components/seo/json-ld'
import { ButtonLink } from '@/components/ui/button'
import { breadcrumbsJsonLd, pageMetadata } from '@/lib/seo'
import { PLANS, formatPrice, getPlan } from '@/lib/plans'
import { config } from '@/lib/config'

export const metadata: Metadata = pageMetadata({
  title: 'Сколько стоит удалённый доступ и на чём можно сэкономить',
  description:
    'Честное сравнение: что входит в тарифы RemIT, сколько стоит удалённый доступ помесячно и в год, калькулятор экономии при переходе с другого сервиса.',
  path: '/sravnenie',
  keywords: [
    'сколько стоит удалённый доступ',
    'дешёвый удалённый доступ',
    'аналог teamviewer цена',
    'сравнение программ удалённого доступа',
  ],
})

const WHY = [
  {
    title: 'Своя инфраструктура',
    text: 'Серверы идентификации и ретрансляции — наши. Мы не перепродаём чужую лицензию и не закладываем в цену маржу вендора.',
  },
  {
    title: 'Ядро на открытом коде',
    text: 'Протокол и клиент построены на открытом проекте RustDesk. Мы не платим за разработку с нуля, поэтому не переносим эти расходы на вас.',
  },
  {
    title: 'Прямые продажи',
    text: 'Нет партнёрской сети и отдела холодных звонков. Экономию на этом отдаём ценой, а не скидками «только сегодня».',
  },
  {
    title: 'Понятные лимиты',
    text: 'Один счётчик: время активного управления. Нет доплат за «коммерческое использование», которое сервис определяет по своему усмотрению.',
  },
]

export default function ComparisonPage() {
  const start = getPlan('start')
  const pro = getPlan('pro')
  const freeHours = Math.round(config.quota.freeSecondsPerDay / 3600)

  return (
    <>
      <JsonLd
        data={breadcrumbsJsonLd([
          { name: 'Главная', path: '/' },
          { name: 'Сравнение и цены', path: '/sravnenie' },
        ])}
      />
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-white/8">
          <div className="glow opacity-70" />
          <div className="relative mx-auto max-w-4xl px-5 py-14 text-center sm:py-16">
            <h1 className="text-[2rem] font-semibold leading-[1.12] sm:text-5xl">
              Сколько стоит удалённый доступ и где вы переплачиваете
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-text-secondary">
              Мы берём ценой: {formatPrice(start.priceMonthly)} в месяц за рабочее место специалиста и{' '}
              {formatPrice(pro.priceMonthly)} за тариф с тремя одновременными сессиями. Бесплатный тариф —{' '}
              {freeHours} часа управления в сутки, компаниям — пробный период до {config.trial.maxDays} дней.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/probnyy-period" size="lg">
                Пробный период для компании
              </ButtonLink>
              <ButtonLink href="/tarify" variant="secondary" size="lg">
                Все тарифы
              </ButtonLink>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">Калькулятор экономии</h2>
          <p className="mt-3 max-w-2xl text-text-secondary">
            Введите, сколько специалистов подключается к клиентам и сколько вы платите за место сейчас —
            посчитаем разницу. Чужие прайсы меняются, поэтому считаем по вашим цифрам, а не по обещаниям.
          </p>
          <div className="mt-8">
            <SavingsCalculator />
          </div>
        </section>

        <section className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold sm:text-3xl">Почему у нас дешевле</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {WHY.map((item) => (
                <div key={item.title} className="card p-6">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">Цены RemIT</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`card p-6 ${plan.highlighted ? 'border-brand-500/60' : ''}`}>
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-3 text-2xl font-semibold">
                  {plan.priceMonthly === 0 ? '0 ₽' : formatPrice(plan.priceMonthly)}
                </p>
                <p className="text-sm text-text-muted">
                  {plan.priceMonthly === 0 ? 'навсегда' : 'в месяц'}
                  {plan.priceYearly > 0 && ` · ${formatPrice(plan.priceYearly)} за год`}
                </p>
                <p className="mt-3 text-sm text-text-secondary">{plan.tagline}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-text-muted">
            Сравнивая с другими сервисами, смотрите не только на цену: считайте число одновременных сессий,
            ограничение по времени и что происходит при превышении лимита. У нас это написано на{' '}
            <a href="/tarify" className="text-brand-400 underline decoration-dotted">
              странице тарифов
            </a>{' '}
            без мелкого шрифта.
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
