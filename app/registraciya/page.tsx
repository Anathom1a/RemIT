import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth/auth-form'
import { Wordmark } from '@/components/brand/logo'
import { getCurrentUser } from '@/lib/auth'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Регистрация' }

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/kabinet')
  const freeHours = Math.round(config.quota.freeSecondsPerDay / 3600)

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="glow opacity-60" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="flex justify-center">
          <Wordmark />
        </Link>
        <div className="card mt-8 p-8">
          <h1 className="text-2xl font-semibold">Создать аккаунт</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            {freeHours} часа удалённого управления в сутки — бесплатно, карта не нужна.
          </p>
          <div className="mt-6">
            <AuthForm mode="register" />
          </div>
          <p className="mt-4 text-center text-xs leading-relaxed text-text-muted">
            Регистрируясь, вы принимаете{' '}
            <Link href="/dokumenty/oferta" className="underline decoration-dotted">
              публичную оферту
            </Link>{' '}
            и{' '}
            <Link href="/dokumenty/politika" className="underline decoration-dotted">
              политику конфиденциальности
            </Link>
            .
          </p>
          <p className="mt-6 text-center text-sm text-text-muted">
            Уже есть аккаунт?{' '}
            <Link href="/vhod" className="text-brand-400 underline decoration-dotted">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
