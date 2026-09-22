import Link from 'next/link'
import { Wordmark } from '@/components/brand/logo'
import { LogoutButton } from '@/components/cabinet/logout-button'
import { requireAdmin } from '@/lib/admin'

const NAV = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/polzovateli', label: 'Пользователи' },
  { href: '/admin/zayavki', label: 'Заявки' },
  { href: '/admin/obrashcheniya', label: 'Обращения' },
  { href: '/admin/platezhi', label: 'Платежи и подписки' },
  { href: '/admin/sessii', label: 'Сессии' },
  { href: '/admin/ustroystva', label: 'Устройства' },
  { href: '/admin/obnovleniya', label: 'Обновления' },
  { href: '/admin/nastroyki', label: 'Настройки' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Wordmark />
            </Link>
            <span className="pill !py-1 !text-xs">админка</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/kabinet" className="hidden text-sm text-text-secondary hover:text-text-primary sm:block">
              Мой кабинет
            </Link>
            <span className="hidden text-sm text-text-muted md:block">{admin.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8">
        <nav className="mb-8 flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-ink-850/60 p-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  )
}
