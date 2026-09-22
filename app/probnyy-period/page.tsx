import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { TrialForm } from '@/components/site/trial-form'
import { JsonLd } from '@/components/seo/json-ld'
import { breadcrumbsJsonLd, faqJsonLd, pageMetadata } from '@/lib/seo'
import { config } from '@/lib/config'
import { formatPrice, getPlan } from '@/lib/plans'

const FAQ = [
  {
    question: 'Сколько длится пробный период RemIT?',
    answer:
      'До 30 дней. Стандартно включаем 14 дней, а если идёт пилот в нескольких филиалах или нужно согласование закупки — продлеваем до месяца. Кнопки «активировать самому» нет: доступ открывает менеджер после проверки заявки, обычно в тот же рабочий день.',
  },
  {
    question: 'Нужно ли привязывать карту для пробного периода?',
    answer: 'Нет. Карта не нужна, оплата не списывается, автопродления нет. По окончании пробного периода аккаунт просто вернётся на бесплатный тариф с лимитом 3 часа в сутки.',
  },
  {
    question: 'Что входит в пробный период?',
    answer:
      'Полный тариф «Профи»: без ограничения по времени сессий, несколько одновременных подключений, неподтверждённый доступ к своим устройствам и история подключений. По запросу открываем «Бизнес» с общей адресной книгой.',
  },
  {
    question: 'Можно ли оплатить по счёту и получить закрывающие документы?',
    answer: 'Да. Для юридических лиц выставляем счёт, работаем по договору, отправляем акт и счёт-фактуру. Оплата картой через ЮKassa тоже доступна.',
  },
]

export const metadata: Metadata = pageMetadata({
  title: 'Пробный период до 30 дней для компаний',
  description:
    'Бесплатный пробный период RemIT до 30 дней для организаций: полный доступ без лимита по времени, без карты и автосписаний. Оставьте заявку — включим доступ в течение рабочего дня.',
  path: '/probnyy-period',
  keywords: [
    'пробный период удалённого доступа',
    'бесплатный тестовый период',
    'удалённый доступ для компаний',
    'протестировать программу удалённого доступа',
  ],
})

export default function TrialPage() {
  const pro = getPlan('pro')
  const freeHours = Math.round(config.quota.freeSecondsPerDay / 3600)

  return (
    <>
      <JsonLd
        data={[
          faqJsonLd(FAQ),
          breadcrumbsJsonLd([
            { name: 'Главная', path: '/' },
            { name: 'Пробный период', path: '/probnyy-period' },
          ]),
        ]}
      />
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-white/8">
          <div className="glow opacity-70" />
          <div className="relative mx-auto max-w-6xl px-5 py-14 sm:py-16">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
              <div>
                <span className="pill">Для компаний</span>
                <h1 className="mt-5 text-[2rem] font-semibold leading-[1.12] sm:text-5xl">
                  Пробный период до {config.trial.maxDays} дней — бесплатно
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-text-secondary">
                  Полный тариф «{pro.name}» на время пробы: без ограничения по времени сессий, с несколькими
                  одновременными подключениями и историей. Без карты и автосписаний. Доступ открывает менеджер
                  после короткой проверки заявки — обычно в тот же рабочий день.
                </p>

                <ul className="mt-7 space-y-3">
                  {[
                    `Включаем доступ в течение рабочего дня после заявки`,
                    `Помогаем развернуть клиент на ваших компьютерах`,
                    `После пробы — тариф от ${formatPrice(getPlan('start').priceMonthly)} в месяц или оплата по счёту`,
                    `Если не подошло — аккаунт вернётся на бесплатный тариф с ${freeHours} часами в сутки`,
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-[0.95rem] text-text-secondary">
                      <svg className="mt-1 size-4 shrink-0 text-success" viewBox="0 0 16 16" fill="none">
                        <path
                          d="m3.5 8.5 3 3 6-7"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 rounded-2xl border border-white/8 bg-ink-850/50 p-5">
                  <p className="text-sm leading-relaxed text-text-secondary">
                    Пробный период включается на аккаунт. Зарегистрируйтесь и укажите ту же почту в заявке —
                    менеджер откроет доступ именно на него.{' '}
                    <Link href="/registraciya" className="text-brand-400 underline decoration-dotted">
                      Создать аккаунт
                    </Link>
                  </p>
                </div>
              </div>

              <TrialForm trialDays={config.trial.maxDays} supportUrl={config.brand.supportUrl} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">Как проходит пилот</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              {
                title: 'День 1. Доступ',
                text: 'Вы оставляете заявку, мы включаем тариф и присылаем ссылку на клиент с уже прописанными серверами.',
              },
              {
                title: 'Дни 2–14. Работа',
                text: 'Подключаете первые рабочие места, проверяете скорость на своих каналах, смотрим журнал подключений вместе.',
              },
              {
                title: 'Итог. Решение',
                text: 'Считаем, сколько сессий и времени реально нужно, подбираем тариф и выставляем счёт. Или расходимся без обязательств.',
              },
            ].map((step) => (
              <div key={step.title} className="card p-6">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-4xl px-5 py-16">
            <h2 className="text-2xl font-semibold sm:text-3xl">Вопросы о пробном периоде</h2>
            <div className="mt-8 divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/8">
              {FAQ.map((item) => (
                <details key={item.question} className="group bg-ink-850/50 px-5 py-4 open:bg-ink-800/60 sm:px-6 sm:py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {item.question}
                    <svg
                      className="size-5 shrink-0 text-text-muted transition-transform group-open:rotate-45"
                      viewBox="0 0 20 20"
                      fill="none"
                    >
                      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
