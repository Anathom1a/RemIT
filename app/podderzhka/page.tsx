import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { FAQ_ITEMS, Faq } from '@/components/site/faq'
import { JsonLd } from '@/components/seo/json-ld'
import { breadcrumbsJsonLd, faqJsonLd, pageMetadata } from '@/lib/seo'
import { ButtonLink } from '@/components/ui/button'
import { config } from '@/lib/config'

export const metadata: Metadata = pageMetadata({
  title: 'Поддержка и ответы на вопросы',
  description:
    'База знаний RemIT: как подключиться к компьютеру, как считается бесплатный лимит 3 часа в сутки, что делать при чёрном экране и проблемах с соединением.',
  path: '/podderzhka',
  keywords: ['удалённый доступ не подключается', 'чёрный экран при подключении', 'как подключиться удалённо'],
})

const ARTICLES = [
  {
    title: 'Первое подключение',
    text: 'Запустите клиент на обоих компьютерах. Продиктуйте ID и одноразовый пароль — специалист подключится к вам.',
  },
  {
    title: 'Соединение не устанавливается',
    text: 'Проверьте интернет на обеих сторонах, перезапустите клиент и убедитесь, что антивирус не блокирует приложение. Если не помогло — напишите нам, мы посмотрим журнал подключений.',
  },
  {
    title: 'Чёрный экран при подключении',
    text: 'Чаще всего причина — экран блокировки или запрос UAC. Попросите пользователя разблокировать компьютер, а для постоянной работы установите клиент как службу.',
  },
  {
    title: 'Перенос подписки на другой компьютер',
    text: 'Подписка привязана к аккаунту, а не к устройству. Отвяжите старое устройство в кабинете и привяжите новое — лимит и тариф перенесутся сразу.',
  },
]

export default function SupportPage() {
  const freeHours = Math.round(config.quota.freeSecondsPerDay / 3600)

  return (
    <>
      <JsonLd
        data={[
          faqJsonLd(FAQ_ITEMS.map((item) => ({ question: item.q, answer: item.a }))),
          breadcrumbsJsonLd([
            { name: 'Главная', path: '/' },
            { name: 'Поддержка', path: '/podderzhka' },
          ]),
        ]}
      />
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-white/8">
          <div className="glow opacity-70" />
          <div className="relative mx-auto max-w-6xl px-5 py-16 text-center">
            <h1 className="text-4xl font-semibold sm:text-5xl">Поддержка</h1>
            <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
              Что-то не так? Обратитесь в поддержку — форма в личном кабинете. Обращение попадает к
              дежурному инженеру, а ответ приходит туда же, в кабинет. Ниже — короткие ответы на то, что
              спрашивают чаще всего.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/kabinet/podderzhka">Обратиться в поддержку</ButtonLink>
              <ButtonLink href={`mailto:${config.brand.supportEmail}`} variant="secondary">
                {config.brand.supportEmail}
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-text-muted">
              Форма доступна после входа в аккаунт — так мы сразу видим ваш тариф и устройства.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-5 md:grid-cols-2">
            {ARTICLES.map((article) => (
              <div key={article.title} className="card p-6">
                <h2 className="font-semibold">{article.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{article.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="limit" className="border-y border-white/8 bg-ink-900/40">
          <div className="mx-auto max-w-4xl px-5 py-16">
            <h2 className="text-2xl font-semibold sm:text-3xl">Как считается бесплатный лимит</h2>
            <div className="mt-6 space-y-4 leading-relaxed text-text-secondary">
              <p>
                Бесплатный тариф даёт {freeHours} часа активного удалённого управления в сутки на аккаунт.
                Сутки считаются по московскому времени: счётчик обнуляется в 00:00.
              </p>
              <p>
                Время начисляется только пока сессия действительно идёт. Запущенный клиент, ожидание
                подключения, чат без управления и передача файлов без сессии управления лимит не тратят.
              </p>
              <p>
                Если в один момент открыты две сессии, расход идёт по каждой: за минуту работы спишется две
                минуты. За 30, 10 и 1 минуту до конца лимита клиент покажет предупреждение, а по исчерпании
                завершит активные сессии и не даст открыть новые до полуночи.
              </p>
              <p>
                Остаток всегда виден в окне клиента и в{' '}
                <Link href="/kabinet" className="text-brand-400 underline decoration-dotted">
                  личном кабинете
                </Link>
                . Подписка снимает ограничение сразу после оплаты — переустанавливать клиент не нужно.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="mb-8 text-center text-2xl font-semibold sm:text-3xl">Частые вопросы</h2>
          <Faq />
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
