import { NextResponse } from 'next/server'
import { accessibleBooks } from '@/lib/address-book'
import { clientRoute } from '@/lib/client-api'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Общие книги: свои (кроме личной) и выданные вам. */
export const POST = clientRoute(async ({ user }) => {
  const store = await getStore()
  const books = (await accessibleBooks(user)).filter(({ book }) => !book.personal)
  const owners = new Map<string, string>()
  for (const { book } of books) {
    if (!owners.has(book.ownerId)) {
      owners.set(book.ownerId, book.ownerId === user.id ? user.email : ((await store.findUserById(book.ownerId))?.email ?? ''))
    }
  }
  return NextResponse.json({
    total: books.length,
    data: books.map(({ book, rule }) => ({
      guid: book.guid,
      name: book.name,
      owner: owners.get(book.ownerId) ?? '',
      note: book.note,
      rule,
    })),
  })
})
