import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth/auth-form'
import { Wordmark } from '@/components/brand/logo'
import { getCurrentUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Вход' }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/kabinet')

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="glow opacity-60" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="flex justify-center">
          <Wordmark />
        </Link>
        <div className="card mt-8 p-8">
          <h1 className="text-2xl font-semibold">Вход в кабинет</h1>
          <p className="mt-1.5 text-sm text-text-muted">Подписка, устройства и остаток бесплатного времени.</p>
          <div className="mt-6">
            <AuthForm mode="login" />
          </div>
          <p className="mt-6 text-center text-sm text-text-muted">
            Нет аккаунта?{' '}
            <Link href="/registraciya" className="text-brand-400 underline decoration-dotted">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
