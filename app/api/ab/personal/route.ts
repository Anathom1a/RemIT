import { NextResponse } from 'next/server'
import { ensurePersonalBook } from '@/lib/address-book'
import { clientRoute } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Личная книга. Раз сервер её отдаёт, клиент работает с книгами по новому API. */
export const POST = clientRoute(async ({ user }) => {
  const book = await ensurePersonalBook(user)
  return NextResponse.json({ guid: book.guid, name: book.name, rule: 3 })
})
