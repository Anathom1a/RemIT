import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { AppPreview } from '@/components/site/app-preview'
import { PricingTable } from '@/components/site/pricing-table'
import { FAQ_ITEMS, Faq } from '@/components/site/faq'
import { JsonLd } from '@/components/seo/json-ld'
import { ButtonLink } from '@/components/ui/button'
import { config } from '@/lib/config'
import { formatPrice, getPlan } from '@/lib/plans'
import { faqJsonLd, pageMetadata, softwareJsonLd } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'RemIT — удалённый доступ к компьютеру по ID и паролю',
  description:
    'Программа удалённого доступа к компьютеру без VPN и проброса портов: подключение по ID за 15 секунд, передача файлов, российские серверы. ' +
    `Бесплатно 3 часа в сутки, тарифы от ${formatPrice(getPlan('start').priceMonthly)} в месяц, компаниям — пробный период до 30 дней.`,
  path: '/',
  keywords: [
    'удалённый доступ',
    'удалённый доступ к компьютеру',
    'удалённый рабочий стол',
    'программа для удалённого доступа',
    'российский аналог teamviewer',
    'удалённая техподдержка',
    'подключиться к компьютеру удалённо',
  ],
})

const FEATURES = [
  {
    title: 'Подключение за 15 секунд',
    text: 'ID и одноразовый пароль — без установки, без учётной записи на стороне клиента, без настройки роутера.',
    icon: 'M13 3 4 14h6l-1 7 9-11h-6l1-7Z',
  },
  {
    title: 'Работает через NAT',
    text: 'Прямое P2P-соединение, а если сеть его не пропускает — автоматический переход на наш ретранслятор.',
    icon: 'M4 12a8 8 0 0 1 16 0M7.5 12a4.5 4.5 0 0 1 9 0M12 12v8',
  },
  {
    title: 'Сквозное шифрование',
    text: 'Трафик сессии шифруется между устройствами. Сервер не видит содержимое экрана, файлов и буфера обмена.',
    icon: 'M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5z',
  },
  {
    title: 'Передача файлов и терминал',
    text: 'Двусторонний обмен файлами, буфер обмена, чат и доступ к командной строке в одной сессии.',
    icon: 'M4 6h7l2 2h7v12H4zM9 14h6M12 11v6',
  },
  {
    title: 'Неподтверждённый доступ',
    text: 'Свои компьютеры в адресной книге доступны по постоянному паролю — без подтверждения на той стороне.',
    icon: 'M4 7h16v13H4zM8 7V5a4 4 0 0 1 8 0v2M12 12v3',
  },
  {
    title: 'Журнал подключений',
    text: 'Кто, куда, когда и сколько минут подключался. Выгрузка отчёта для руководителя и для клиента.',
    icon: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  },
]

const STEPS = [
  {
    title: 'Скачайте клиент',
    text: 'Один файл для Windows, macOS и Linux. Установка не обязательна — можно запустить портативную версию.',
  },
  {
    title: 'Сообщите ID и пароль',
    text: 'Клиент показывает ID устройства и одноразовый пароль. Передайте их специалисту — или подключитесь сами.',
  },
  {
    title: 'Работайте',
    text: 'Управление, файлы, терминал и чат. Остаток бесплатного времени виден прямо в окне клиента.',
  },
]

export default function HomePage() {
  const freeHours = Math.round(config.quota.freeSecondsPerDay / 3600)
  const start = getPlan('start')

  return (
    <>
      <JsonLd
        data={[
          softwareJsonLd(),
          faqJsonLd(FAQ_ITEMS.map((item) => ({ question: item.q, answer: item.a }))),
        ]}
      />
      <SiteHeader />

      <main>
        {/* Герой */}
        <section className="relative overflow-hidden">
          <div className="glow" />
          <div className="absolute inset-0 grid-bg" />
          <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <span className="pill">
                <span className="size-1.5 rounded-full bg-success" />
                Серверы в России · оплата в рублях
              </span>
              <h1 className="mt-6 text-[2rem] font-semibold leading-[1.12] sm:text-5xl lg:text-6xl">
                Удалённый доступ <span className="text-gradient">без лишних слов</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-text-secondary">
                {config.brand.name} подключает к компьютеру за 15 секунд: ID, пароль и всё.
                Бесплатно — {freeHours} часа управления каждый день, подписка от{' '}
                {formatPrice(start.priceMonthly)} в месяц снимает лимит, компаниям — пробный период до{' '}
                {config.trial.maxDays} дней.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <ButtonLink href="/skachat" size="lg">
                  Скачать бесплатно
                </ButtonLink>
                <ButtonLink href="/tarify" variant="secondary" size="lg">
                  Посмотреть тарифы
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-text-muted">
                Без карты при регистрации · {freeHours} часа в сутки навсегда бесплатно ·{' '}
                <Link href="/probnyy-period" className="underline decoration-dotted hover:text-text-primary">
                  пробный период для компаний
                </Link>
              </p>
            </div>

            <div className="relative mx-auto mt-14 max-w-4xl">
              <AppPreview />
            </div>
          </div>
        </section>

        {/* Показатели */}
        <section className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 py-10 md:grid-cols-4">
            {[
              { value: `${freeHours} часа`, label: 'бесплатно каждый день' },
              { value: '< 60 мс', label: 'задержка на российских каналах' },
              { value: '60 FPS', label: 'при передаче экрана' },
              { value: '24/7', label: 'поддержка в Telegram' },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-2xl font-semibold text-text-primary sm:text-3xl">{item.value}</p>
                <p className="mt-1 text-sm text-text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Возможности */}
        <section id="vozmozhnosti" className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">Всё, что нужно для поддержки</h2>
            <p className="mt-4 text-text-secondary">
              Функции, ради которых обычно покупают дорогие западные программы. У нас они входят в базовый
              набор и работают на российской инфраструктуре.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card card-hover p-6">
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-500/12 text-brand-400">
                  <svg viewBox="0 0 24 24" fill="none" className="size-6">
                    <path
                      d={feature.icon}
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Как работает */}
        <section id="kak-rabotaet" className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-3xl font-semibold sm:text-4xl">Три шага до подключения</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.title} className="card p-6">
                  <span className="text-sm font-semibold text-brand-400">0{index + 1}</span>
                  <h3 className="mt-3 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Лимит 3 часа */}
        <section id="limit" className="mx-auto max-w-6xl px-5 py-20">
          <div className="card grid items-center gap-10 p-8 md:grid-cols-2 md:p-12">
            <div>
              <span className="pill">Честный бесплатный тариф</span>
              <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
                {freeHours} часа управления в сутки — бесплатно и навсегда
              </h2>
              <p className="mt-4 leading-relaxed text-text-secondary">
                Мы не ограничиваем число устройств в бесплатном тарифе и не считаем сессии «коммерческими»
                по своему усмотрению. Есть один понятный счётчик: {freeHours} часа активного управления в
                сутки. Он обнуляется в 00:00 по московскому времени, а остаток всегда виден в клиенте и в
                личном кабинете.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-text-secondary">
                {[
                  'Время идёт только во время активной сессии',
                  'Предупреждения за 30, 10 и 1 минуту до конца лимита',
                  'Подписка снимает ограничение мгновенно, без переустановки клиента',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <svg className="mt-0.5 size-4 shrink-0 text-success" viewBox="0 0 16 16" fill="none">
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
              <div className="mt-8">
                <ButtonLink href="/registraciya">Создать бесплатный аккаунт</ButtonLink>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-8">
              <p className="text-sm text-text-muted">Сегодня, {new Date().toLocaleDateString('ru-RU')}</p>
              <div className="mt-6 space-y-5">
                {[
                  { label: 'Использовано', value: '46 мин', width: '26%', tone: 'from-brand-500 to-cyan-accent' },
                  { label: 'Осталось', value: '2 ч 14 мин', width: '74%', tone: 'from-success to-success' },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-text-secondary">{row.label}</span>
                      <span className="font-semibold tabular-nums">{row.value}</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8">
                      <div className={`h-full rounded-full bg-gradient-to-r ${row.tone}`} style={{ width: row.width }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-8 text-sm text-text-muted">
                Счётчик обнулится через 6 ч 12 мин — в 00:00 по московскому времени.
              </p>
            </div>
          </div>
        </section>

        {/* Тарифы */}
        <section id="tarify" className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-semibold sm:text-4xl">Тарифы</h2>
              <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
                Начните бесплатно, переходите на подписку, когда {freeHours} часа в сутки перестанет хватать.
                Оплата картой или по счёту, отмена в любой момент.
              </p>
            </div>
            <PricingTable />
          </div>
        </section>

        {/* Компаниям */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="card grid items-center gap-8 p-8 md:grid-cols-[1.3fr_1fr] md:p-12">
            <div>
              <span className="pill">Компаниям</span>
              <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">
                Пробный период до {config.trial.maxDays} дней
              </h2>
              <p className="mt-4 leading-relaxed text-text-secondary">
                Организациям включаем полный тариф на время пилота: без ограничения по времени сессий, с
                несколькими одновременными подключениями и историей. Без карты и автосписаний — если не
                подойдёт, просто ничего не платите.
              </p>
              <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <ButtonLink href="/probnyy-period">Оставить заявку</ButtonLink>
                <ButtonLink href="/dlya-biznesa" variant="secondary">
                  Решения для бизнеса
                </ButtonLink>
              </div>
            </div>
            <ul className="space-y-3 text-sm text-text-secondary">
              {[
                'Счёт на организацию и закрывающие документы',
                'Помогаем развернуть клиент на рабочих местах',
                'Журнал подключений и отчёт по времени',
                'Выделенный сервер под ваш контур по запросу',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 16 16" fill="none">
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
          </div>
        </section>

        {/* Безопасность */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold sm:text-4xl">Контроль на вашей стороне</h2>
              <p className="mt-4 leading-relaxed text-text-secondary">
                Мы строим сервис так, чтобы им можно было пользоваться в компании, где к удалённому доступу
                относятся серьёзно: журнал подключений, привязка устройств к аккаунту, запрет анонимных
                сессий и возможность развернуть выделенный сервер под ваш контур.
              </p>
              <div className="mt-8">
                <Link
                  href="/podderzhka"
                  className="text-sm font-medium text-brand-400 underline decoration-dotted underline-offset-4 hover:text-brand-300"
                >
                  Как настроить корпоративный контур →
                </Link>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: 'Шифрование', text: 'NaCl-шифрование сессии между устройствами' },
                { title: 'Журнал', text: 'История подключений с длительностью и участниками' },
                { title: 'Привязка', text: 'Устройства закрепляются за аккаунтом в кабинете' },
                { title: 'Свой сервер', text: 'Выделенная инсталляция для корпоративного контура' },
              ].map((item) => (
                <div key={item.title} className="card p-5">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-text-secondary">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Вопросы */}
        <section className="border-t border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="mb-10 text-center text-3xl font-semibold sm:text-4xl">Частые вопросы</h2>
            <Faq />
          </div>
        </section>

        {/* Призыв */}
        <section className="relative overflow-hidden">
          <div className="glow opacity-70" />
          <div className="relative mx-auto max-w-4xl px-5 py-20 text-center">
            <h2 className="text-3xl font-semibold sm:text-4xl">Попробуйте сегодня — {freeHours} часа уже ваши</h2>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary">
              Регистрация занимает минуту, карта не нужна. Подписку можно оформить позже, прямо из кабинета.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/registraciya" size="lg">
                Создать аккаунт
              </ButtonLink>
              <ButtonLink href={config.brand.supportUrl} variant="secondary" size="lg">
                Задать вопрос
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
