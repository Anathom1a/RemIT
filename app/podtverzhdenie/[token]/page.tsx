import type { Metadata } from 'next'
import Link from 'next/link'
import { Wordmark } from '@/components/brand/logo'
import { confirmEmail } from '@/lib/email-verification'

export const metadata: Metadata = {
  title: 'Подтверждение почты',
  robots: { index: false, follow: false },
  // В адресе одноразовая ссылка — не отдаём её через Referer.
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

export default async function ConfirmEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await confirmEmail(token)

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="glow opacity-60" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="flex justify-center">
          <Wordmark />
        </Link>
        <div className="card mt-8 p-8">
          {result.ok ? (
            <>
              <h1 className="text-2xl font-semibold">Почта подтверждена</h1>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {result.user.email} — на этот адрес будут приходить кассовые чеки и важные уведомления. Теперь
                можно оформить подписку.
              </p>
              <Link
                href="/kabinet"
                className="mt-6 block rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-center text-sm font-medium text-white"
              >
                Открыть кабинет
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">Ссылка не действует</h1>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {result.error} Войдите в кабинет — там можно отправить письмо ещё раз.
              </p>
              <Link
                href="/kabinet"
                className="mt-6 block rounded-xl border border-white/12 bg-ink-800/70 px-5 py-2.5 text-center text-sm text-text-primary"
              >
                Войти в кабинет
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
