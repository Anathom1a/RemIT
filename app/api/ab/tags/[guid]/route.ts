import { NextResponse } from 'next/server'
import { requireBook } from '@/lib/address-book'
import { clientRoute } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Метки книги: [{name, color}]. */
export const POST = clientRoute(async ({ user }, _request, { guid }) => {
  const book = await requireBook(user, guid, 1)
  return NextResponse.json(book.tags.map((tag) => ({ name: tag.name, color: tag.color })))
})
