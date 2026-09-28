import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Ссылка не действует', robots: { index: false } }

/** Гостевая ссылка на веб-клиент устарела, использована или отозвана. */
export default function ShareExpiredPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold">Ссылка не действует</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Срок ссылки истёк, её уже использовали или владелец её отозвал. Попросите прислать новую.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-brand-400 hover:text-brand-300">
          На главную
        </Link>
      </div>
    </main>
  )
}
