import { NextResponse } from 'next/server'
import { legacyBook, saveLegacyBook } from '@/lib/address-book'
import { clientRoute, readJson } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Старый формат адресной книги: вся личная книга одной JSON-строкой в поле data. */
export const GET = clientRoute(async ({ user }) => NextResponse.json({ data: await legacyBook(user) }))

export const POST = clientRoute(async ({ user }, request) => {
  const body = await readJson<{ data?: unknown }>(request)
  await saveLegacyBook(user, body?.data)
  return NextResponse.json(null)
})
