import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { JsonLd } from '@/components/seo/json-ld'
import { ButtonLink } from '@/components/ui/button'
import { breadcrumbsJsonLd, faqJsonLd, pageMetadata, softwareJsonLd } from '@/lib/seo'
import { formatPrice, getPlan } from '@/lib/plans'
import { config } from '@/lib/config'

const FAQ = [
  {
    question: 'Подходит ли RemIT для компании с филиалами?',
    answer:
      'Да. Клиент работает через NAT без VPN и белых адресов: сотрудник запускает программу, специалист подключается по ID. Для филиалов удобен неподтверждённый доступ к своим устройствам по постоянному паролю.',
  },
  {
    question: 'Где находятся серверы и что видит сервис?',
    answer:
      'Серверы идентификации и ретрансляции размещены в России. Содержимое сессии шифруется между устройствами: сервер видит только служебные данные подключения — идентификаторы, время начала и окончания.',
  },
  {
    question: 'Можно ли развернуть сервер внутри контура компании?',
    answer:
      'Да, возможна выделенная инсталляция на ваших мощностях: сервер идентификации, ретранслятор и панель управления. Условия обсуждаем отдельно — напишите в отдел продаж.',
  },
  {
    question: 'Что делать, если нужно больше 10 одновременных подключений?',
    answer:
      'Для этого есть корпоративный тариф: число одновременных сессий согласовывается отдельно — 25, 50, 100 и больше. Цена договорная, лимит меняется по обращению без перехода на другой тариф.',
  },
  {
    question: 'Как оплатить с расчётного счёта?',
    answer:
      'Выставляем счёт на юридическое лицо, работаем по договору, отправляем закрывающие документы. Оплата картой через ЮKassa тоже доступна — подписка включается сразу после платежа.',
  },
]

export const metadata: Metadata = pageMetadata({
  title: 'Удалённый доступ для бизнеса и техподдержки',
  description:
    'RemIT для компаний: удалённая поддержка сотрудников и филиалов без VPN, журнал подключений, оплата по счёту и договор. ' +
    `Пробный период до 30 дней, тарифы от ${formatPrice(getPlan('start').priceMonthly)} в месяц.`,
  path: '/dlya-biznesa',
  keywords: [
    'удалённый доступ для бизнеса',
    'удалённая поддержка сотрудников',
    'программа удалённого доступа для компании',
    'удалённый рабочий стол для организации',
    'техподдержка филиалов',
  ],
})

const CASES = [
  {
    title: 'Служба поддержки',
    text: 'Оператор подключается к рабочему месту за 15 секунд: ID и одноразовый пароль. Не нужно объяснять по телефону, куда нажимать.',
  },
  {
    title: 'Розница и касса',
    text: 'Постоянный доступ к кассам и терминалам по своему паролю — без вызова сотрудника и без ожидания, пока кто-то подтвердит подключение.',
  },
  {
    title: 'Филиалы и удалёнка',
    text: 'Сотрудник работает из дома, а сервер и 1С остаются в офисе. Прямое соединение, при необходимости — через наш ретранслятор.',
  },
  {
    title: 'Сервисные компании',
    text: 'Обслуживаете чужой парк техники: адресная книга, история подключений и отчёт по времени для клиента.',
  },
]

export default function BusinessPage() {
  const pro = getPlan('pro')
  const business = getPlan('business')

  return (
    <>
      <JsonLd
        data={[
          softwareJsonLd(),
          faqJsonLd(FAQ),
          breadcrumbsJsonLd([
            { name: 'Главная', path: '/' },
            { name: 'Для бизнеса', path: '/dlya-biznesa' },
          ]),
        ]}
      />
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-white/8">
          <div className="glow opacity-70" />
          <div className="relative mx-auto max-w-6xl px-5 py-14 sm:py-16">
            <div className="max-w-3xl">
              <span className="pill">Для организаций</span>
              <h1 className="mt-5 text-[2rem] font-semibold leading-[1.12] sm:text-5xl">
                Удалённый доступ для бизнеса и техподдержки
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-text-secondary">
                Помогайте сотрудникам и клиентам без VPN, белых адресов и проброса портов. Серверы в России,
                оплата по счёту, журнал подключений и понятные тарифы: {formatPrice(pro.priceMonthly)} в месяц
                за три одновременные сессии.
              </p>
              <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <ButtonLink href="/probnyy-period" size="lg">
                  Пробный период до {config.trial.maxDays} дней
                </ButtonLink>
                <ButtonLink href="/sravnenie" variant="secondary" size="lg">
                  Посчитать экономию
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-text-muted">
                Без карты и автосписаний · счёт и закрывающие документы для юрлиц
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">Где это работает каждый день</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {CASES.map((item) => (
              <div key={item.title} className="card p-6">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold sm:text-3xl">Что важно закупке и безопасности</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {[
                {
                  title: 'Российская инфраструктура',
                  text: 'Серверы идентификации и ретрансляции в России, оплата в рублях, договор с российским юридическим лицом.',
                },
                {
                  title: 'Шифрование и журнал',
                  text: 'Содержимое сессии шифруется между устройствами. В журнале видно, кто, куда и сколько подключался.',
                },
                {
                  title: 'Контроль устройств',
                  text: 'Устройства привязываются к аккаунтам, настройки клиентов рассылаются централизованно с сервера.',
                },
              ].map((item) => (
                <div key={item.title} className="card p-6">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="card grid gap-8 p-8 md:grid-cols-[1.2fr_1fr] md:items-center md:p-12">
            <div>
              <h2 className="text-2xl font-semibold sm:text-3xl">Тариф «{business.name}» для команды</h2>
              <p className="mt-4 leading-relaxed text-text-secondary">
                {business.tagline}. {formatPrice(business.priceMonthly)} в месяц или{' '}
                {formatPrice(business.priceYearly)} за год: до {business.concurrentSessions} одновременных
                сессий, общая адресная книга, журнал действий и выгрузка отчётов.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-text-secondary">
                {business.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 16 16" fill="none">
                      <path
                        d="m3.5 8.5 3 3 6-7"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-6">
              <h3 className="font-semibold">Связаться с отделом продаж</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Ответим на вопросы закупки, вышлем счёт и договор, поможем спланировать пилот.
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <div>
                  <dt className="text-text-muted">Почта</dt>
                  <dd>
                    <a href={`mailto:${config.brand.salesEmail}`} className="text-brand-400 underline decoration-dotted">
                      {config.brand.salesEmail}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Поддержка</dt>
                  <dd>
                    <a href={config.brand.supportUrl} className="text-brand-400 underline decoration-dotted">
                      форма в кабинете
                    </a>
                  </dd>
                </div>
              </dl>
              <div className="mt-6">
                <ButtonLink href="/probnyy-period" className="w-full">
                  Оставить заявку
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold sm:text-3xl">{getPlan('corporate').name} тариф</h2>
              <span className="pill !py-0.5 !text-[11px]">цена договорная</span>
            </div>
            <p className="mt-4 max-w-3xl leading-relaxed text-text-secondary">
              Если десяти одновременных сессий мало — берём столько, сколько нужно: 25, 50, 100 и больше.
              Число сессий фиксируется в договоре и меняется по обращению, без перехода на другой тариф и
              без переустановки клиентов.
            </p>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {[
                {
                  title: 'Считаем по людям',
                  text: 'Сессии нужны одновременно работающим специалистам. Сколько их в пике — столько и включаем.',
                },
                {
                  title: 'Меняется на ходу',
                  text: 'Выросла смена или пришёл сезон — увеличиваем лимит в тот же день, уменьшаем так же просто.',
                },
                {
                  title: 'Цена по договору',
                  text: 'Стоимость зависит от числа сессий и срока. Выставляем счёт, работаем по договору, отправляем закрывающие документы.',
                },
              ].map((item) => (
                <div key={item.title} className="card p-6">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/probnyy-period">Обсудить корпоративные условия</ButtonLink>
              <ButtonLink href={`mailto:${config.brand.salesEmail}`} variant="secondary">
                {config.brand.salesEmail}
              </ButtonLink>
            </div>
          </div>
        </section>

        <section className="bg-ink-900/20">
          <div className="mx-auto max-w-4xl px-5 py-16">
            <h2 className="text-2xl font-semibold sm:text-3xl">Частые вопросы компаний</h2>
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
