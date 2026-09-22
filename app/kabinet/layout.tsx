import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/logo'
import { LogoutButton } from '@/components/cabinet/logout-button'
import { getCurrentUser } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { getRuntimeSettings } from '@/lib/settings'

const NAV = [
  { href: '/kabinet', label: 'Обзор' },
  { href: '/kabinet/ustroystva', label: 'Устройства' },
  { href: '/kabinet/podderzhka', label: 'Поддержка' },
  { href: '/kabinet/podpiska', label: 'Подписка' },
]

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')
  const settings = await getRuntimeSettings()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-4">
            {isAdmin(user) && (
              <Link href="/admin" className="text-sm text-brand-400 hover:text-brand-300">
                Админка
              </Link>
            )}
            <span className="hidden text-sm text-text-muted sm:block">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        <nav className="mb-8 flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-ink-850/60 p-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {settings.maintenanceMessage && (
          <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/5 px-5 py-4 text-sm leading-relaxed text-text-secondary">
            {settings.maintenanceMessage}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
