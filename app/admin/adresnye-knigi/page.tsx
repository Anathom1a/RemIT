import type { Metadata } from 'next'
import Link from 'next/link'
import { DataTable } from '@/components/ui/data-table'
import { RULE_NAMES } from '@/lib/address-book'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import type { AbPeer, AddressBook } from '@/lib/types'

export const metadata: Metadata = { title: 'Адресные книги' }
export const dynamic = 'force-dynamic'

/**
 * Адресные книги всех аккаунтов — только просмотр. Правит их владелец в
 * кабинете или в клиенте.
 */
export default async function AdminAddressBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ ab?: string; user?: string }>
}) {
  const { ab, user } = await searchParams
  const store = await getStore()
  const books: AddressBook[] = user
    ? [...(await store.listAddressBooksByOwner(user)), ...(await store.listAddressBooksSharedWith(user))]
    : await store.listAddressBooks(200)
  const selected = ab ? await store.findAddressBook(ab) : null

  const emails = new Map<string, string>()
  const ids = new Set([...books, ...(selected ? [selected] : [])].flatMap((book) => [book.ownerId, ...book.shares.map((s) => s.userId)]))
  for (const id of ids) emails.set(id, (await store.findUserById(id))?.email ?? 'удалённый аккаунт')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Адресные книги</h1>
        <p className="mt-1 text-sm text-text-muted">
          {user ? `Книги аккаунта ${emails.get(user) ?? ''}` : `Последние изменённые · ${books.length}`}
          {user && (
            <Link href="/admin/adresnye-knigi" className="ml-3 text-brand-400 hover:text-brand-300">
              все книги
            </Link>
          )}
        </p>
      </div>

      <div className="card overflow-hidden">
        <DataTable<AddressBook>
          rows={books}
          getKey={(book) => book.guid}
          minWidth={900}
          empty="Книг пока нет: личная книга появляется при первом входе в клиенте или в кабинете."
          columns={[
            {
              key: 'name',
              header: 'Книга',
              primary: true,
              render: (book) => (
                <Link
                  href={`/admin/adresnye-knigi?ab=${book.guid}${user ? `&user=${user}` : ''}`}
                  className="text-brand-400 hover:text-brand-300"
                >
                  {book.name}
                  {book.personal && <span className="ml-1.5 text-xs text-text-muted">личная</span>}
                </Link>
              ),
            },
            { key: 'owner', header: 'Владелец', render: (book) => emails.get(book.ownerId) },
            { key: 'peers', header: 'Записей', render: (book) => <span className="tabular-nums">{book.peers.length}</span> },
            { key: 'tags', header: 'Меток', render: (book) => <span className="tabular-nums">{book.tags.length}</span> },
            {
              key: 'shares',
              header: 'Доступ',
              render: (book) =>
                book.shares.length === 0 ? (
                  <span className="text-text-muted">только владелец</span>
                ) : (
                  <span className="text-xs">
                    {book.shares.map((share) => `${emails.get(share.userId)} (${RULE_NAMES[share.rule]})`).join(', ')}
                  </span>
                ),
            },
            { key: 'updated', header: 'Изменена', render: (book) => formatDateTime(book.updatedAt) },
          ]}
        />
      </div>

      {selected && (
        <div className="card overflow-hidden">
          <div className="border-b border-white/8 px-6 py-4">
            <h2 className="font-semibold">
              {selected.name} · {emails.get(selected.ownerId)}
            </h2>
            {selected.tags.length > 0 && (
              <p className="mt-1 text-xs text-text-muted">Метки: {selected.tags.map((tag) => tag.name).join(', ')}</p>
            )}
          </div>
          <DataTable<AbPeer>
            rows={selected.peers}
            getKey={(peer) => peer.id}
            minWidth={820}
            empty="В книге нет записей."
            columns={[
              { key: 'id', header: 'ID', primary: true, render: (peer) => <span className="font-mono text-xs">{peer.id}</span> },
              { key: 'alias', header: 'Имя', render: (peer) => peer.alias || '—' },
              {
                key: 'device',
                header: 'Устройство',
                render: (peer) => [peer.hostname, peer.username, peer.platform].filter(Boolean).join(' · ') || '—',
              },
              { key: 'tags', header: 'Метки', render: (peer) => peer.tags.join(', ') || '—' },
              { key: 'note', header: 'Заметка', render: (peer) => <span className="text-xs">{peer.note || '—'}</span> },
            ]}
          />
        </div>
      )}
    </div>
  )
}
