import type { Metadata } from 'next'
import Link from 'next/link'
import { ResetRequestForm } from '@/components/auth/reset-forms'
import { Wordmark } from '@/components/brand/logo'
import { config } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Восстановление пароля',
  robots: { index: false, follow: false },
}

export default function ResetRequestPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="glow opacity-60" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="flex justify-center">
          <Wordmark />
        </Link>
        <div className="card mt-8 p-8">
          <h1 className="text-2xl font-semibold">Восстановление пароля</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Пришлём на почту ссылку, по которой можно задать новый пароль.
          </p>
          <div className="mt-6">
            <ResetRequestForm supportEmail={config.brand.supportEmail} />
          </div>
          <p className="mt-6 text-center text-sm text-text-muted">
            Вспомнили?{' '}
            <Link href="/vhod" className="text-brand-400 underline decoration-dotted">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
