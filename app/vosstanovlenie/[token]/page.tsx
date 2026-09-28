import type { Metadata } from 'next'
import Link from 'next/link'
import { ResetPasswordForm } from '@/components/auth/reset-forms'
import { Wordmark } from '@/components/brand/logo'
import { MIN_PASSWORD_LENGTH, isResetTokenValid } from '@/lib/password-reset'

export const metadata: Metadata = {
  title: 'Новый пароль',
  robots: { index: false, follow: false },
  // В адресе одноразовая ссылка: не передаём её через Referer никуда, даже
  // если человек нажмёт на ссылку со страницы.
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = await isResetTokenValid(token)

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="glow opacity-60" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="flex justify-center">
          <Wordmark />
        </Link>
        <div className="card mt-8 p-8">
          {valid ? (
            <>
              <h1 className="text-2xl font-semibold">Новый пароль</h1>
              <p className="mt-1.5 text-sm text-text-muted">
                После сохранения вы войдёте в кабинет, а на остальных устройствах сессии завершатся.
              </p>
              <div className="mt-6">
                <ResetPasswordForm token={token} minLength={MIN_PASSWORD_LENGTH} />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">Ссылка не действует</h1>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Она устарела — ссылка живёт час — или уже использована. Запросите новую: письмо придёт
                через минуту.
              </p>
              <Link
                href="/vosstanovlenie"
                className="mt-6 block rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-center text-sm font-medium text-white"
              >
                Запросить новую ссылку
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
