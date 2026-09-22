import Link from 'next/link'
import { Wordmark } from '@/components/brand/logo'
import { ButtonLink } from '@/components/ui/button'
import { MobileNav } from '@/components/site/mobile-nav'

const NAV = [
  { href: '/#vozmozhnosti', label: 'Возможности' },
  { href: '/tarify', label: 'Тарифы' },
  { href: '/dlya-biznesa', label: 'Для бизнеса' },
  { href: '/skachat', label: 'Скачать' },
  { href: '/podderzhka', label: 'Поддержка' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
        <Link href="/" aria-label="На главную" className="shrink-0">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/vhod" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Войти
          </ButtonLink>
          <ButtonLink href="/registraciya" size="sm" className="hidden sm:inline-flex">
            Начать бесплатно
          </ButtonLink>
          <MobileNav items={NAV} />
        </div>
      </div>
    </header>
  )
}
