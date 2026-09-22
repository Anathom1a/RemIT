import Link from 'next/link'
import { Wordmark } from '@/components/brand/logo'
import { config } from '@/lib/config'

const COLUMNS = [
  {
    title: 'Продукт',
    links: [
      { href: '/#vozmozhnosti', label: 'Возможности' },
      { href: '/tarify', label: 'Тарифы' },
      { href: '/dlya-biznesa', label: 'Для бизнеса' },
      { href: '/probnyy-period', label: 'Пробный период' },
      { href: '/sravnenie', label: 'Сравнение и цены' },
      { href: '/skachat', label: 'Скачать клиент' },
      { href: '/kabinet', label: 'Личный кабинет' },
    ],
  },
  {
    title: 'Помощь',
    links: [
      { href: '/podderzhka', label: 'База знаний' },
      { href: '/podderzhka#limit', label: 'Про лимит 3 часа' },
      { href: config.brand.supportUrl, label: 'Написать в поддержку' },
      { href: `mailto:${config.brand.supportEmail}`, label: config.brand.supportEmail },
      { href: `mailto:${config.brand.salesEmail}`, label: `${config.brand.salesEmail} — счета и договоры` },
    ],
  },
  {
    title: 'Документы',
    links: [
      { href: '/dokumenty/oferta', label: 'Публичная оферта' },
      { href: '/dokumenty/soglashenie', label: 'Пользовательское соглашение' },
      { href: '/dokumenty/politika', label: 'Политика конфиденциальности' },
      { href: '/dokumenty/soglasie', label: 'Согласие на обработку данных' },
      { href: '/dokumenty/licenzii', label: 'Лицензии и открытый код' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-white/8 bg-ink-900/60">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-text-muted">
              Удалённый доступ к компьютерам и техподдержка без VPN. Серверы в России, оплата в рублях,
              бесплатно — 3 часа управления каждый день.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold text-text-primary">{column.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-text-muted transition-colors hover:text-text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/8 pt-6 text-xs text-text-muted md:flex-row md:items-center md:justify-between">
          <span>
            © {new Date().getFullYear()} {config.brand.name}. Все права защищены.
          </span>
          <span>
            Клиент собран на основе открытого проекта RustDesk (AGPL-3.0). Исходный код изменений —{' '}
            <Link href="/dokumenty/licenzii" className="underline decoration-dotted hover:text-text-primary">
              на странице лицензий
            </Link>
            .
          </span>
        </div>
      </div>
    </footer>
  )
}
