import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookEditor } from '@/components/address-book/book-editor'
import { accessibleBooks, RULE_NAMES } from '@/lib/address-book'
import { getCurrentUser } from '@/lib/auth'
import { config } from '@/lib/config'
import { getStore } from '@/lib/store'

export const metadata: Metadata = { title: 'Адресная книга' }
export const dynamic = 'force-dynamic'

export default async function AddressBookPage({ searchParams }: { searchParams: Promise<{ ab?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const { ab } = await searchParams
  const books = await accessibleBooks(user)
  const current = books.find(({ book }) => book.guid === ab) ?? books[0]
  const { book, rule, owner } = current

  const store = await getStore()
  const people = new Map<string, string>()
  for (const id of new Set([...books.map(({ book: item }) => item.ownerId), ...book.shares.map((share) => share.userId)])) {
    people.set(id, id === user.id ? user.email : ((await store.findUserById(id))?.email ?? 'удалённый аккаунт'))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Адресная книга</h1>
        <p className="mt-1 text-sm text-text-muted">
          Те же записи, что во вкладке «Адресная книга» в клиенте {config.brand.name}: правки здесь появляются в
          клиенте и наоборот.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {books.map(({ book: item, owner: mine }) => (
          <Link
            key={item.guid}
            href={`/kabinet/adresnaya-kniga?ab=${item.guid}`}
            className={`rounded-xl border px-3.5 py-2 text-sm transition-colors ${
              item.guid === book.guid
                ? 'border-brand-500 bg-brand-500/10 text-text-primary'
                : 'border-white/10 text-text-secondary hover:border-white/25 hover:text-text-primary'
            }`}
          >
            {item.name}
            <span className="ml-2 text-xs text-text-muted">
              {item.personal ? 'личная' : mine ? 'общая' : `от ${people.get(item.ownerId)}`} · {item.peers.length}
            </span>
          </Link>
        ))}
      </div>

      {!owner && (
        <p className="rounded-xl border border-white/8 px-4 py-3 text-sm text-text-secondary">
          Книгу открыл вам {people.get(book.ownerId)}, ваш доступ — {RULE_NAMES[rule]}.
        </p>
      )}

      <BookEditor book={book} rule={rule} owner={owner} people={people} endpoint="/api/v1/address-books" allowCreate />
    </div>
  )
}
