import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'
import { PLANS, formatPrice } from '@/lib/plans'
import { config } from '@/lib/config'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Публичная оферта',
  description:
    'Публичная оферта сервиса удалённого доступа RemIT: предмет договора, тарифы, порядок оплаты, пробный период для организаций и возврат средств.',
  path: '/dokumenty/oferta',
})

export default function OfferPage() {
  const freeHours = Math.round(config.quota.freeSecondsPerDay / 3600)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-16">
        <h1 className="text-4xl font-semibold">Публичная оферта</h1>
        <div className="mt-4 rounded-2xl border border-warning/25 bg-warning/5 p-5 text-sm leading-relaxed text-text-secondary">
          Шаблон. Перед приёмом платежей заполните реквизиты исполнителя и согласуйте текст с юристом:
          платёжные провайдеры проверяют оферту, политику обработки данных и порядок возврата.
        </div>

        <div className="mt-10 space-y-8 leading-relaxed text-text-secondary">
          <section>
            <h2 className="text-xl font-semibold text-text-primary">1. Термины</h2>
            <p className="mt-3">
              Сервис — программный комплекс {config.brand.name}, доступный на сайте {config.brand.domain} и
              в клиентских приложениях. Исполнитель — [наименование, ИНН, ОГРН, адрес]. Пользователь — лицо,
              принявшее условия настоящей оферты.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary">2. Предмет</h2>
            <p className="mt-3">
              Исполнитель предоставляет Пользователю доступ к Сервису для организации удалённых подключений
              к устройствам Пользователя и устройствам третьих лиц, получивших согласие на подключение.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary">3. Бесплатное использование</h2>
            <p className="mt-3">
              Бесплатный тариф предусматривает не более {freeHours} часов активного удалённого управления в
              течение календарных суток по московскому времени на один аккаунт. По исчерпании лимита
              активные сессии завершаются, новые подключения отклоняются до начала следующих суток.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary">4. Пробный период для организаций</h2>
            <p className="mt-3">
              Юридическим лицам и индивидуальным предпринимателям по заявке предоставляется пробный период
              продолжительностью до {config.trial.maxDays} дней. Пробный период предоставляется бесплатно, не
              требует привязки платёжных средств и не продлевается автоматически. Решение о предоставлении
              пробного периода, его сроке и составе принимает Исполнитель; в предоставлении может быть
              отказано без объяснения причин. По окончании пробного периода доступ переходит на бесплатный
              тариф, если подписка не оформлена.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary">5. Тарифы и оплата</h2>
            <p className="mt-3">Стоимость подписки на момент публикации:</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              {PLANS.filter((plan) => plan.priceMonthly > 0).map((plan) => (
                <li key={plan.id}>
                  «{plan.name}» — {formatPrice(plan.priceMonthly)} в месяц, {formatPrice(plan.priceYearly)} в год.
                </li>
              ))}
            </ul>
            <p className="mt-3">
              Оплата производится авансом. Услуга считается оказанной по окончании оплаченного периода.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary">6. Возврат средств</h2>
            <p className="mt-3">
              Возврат за неиспользованный период осуществляется по заявлению Пользователя, направленному на{' '}
              {config.brand.supportEmail}, в срок [указать] банковских дней.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary">7. Ответственность и ограничения</h2>
            <p className="mt-3">
              Сервис предоставляется «как есть». Пользователь обязуется не использовать Сервис для доступа к
              устройствам без согласия их владельцев и несёт ответственность за действия, совершённые в ходе
              удалённых сессий.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary">8. Реквизиты</h2>
            <p className="mt-3">[Наименование, ИНН, ОГРН, банковские реквизиты, адрес, телефон]</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
