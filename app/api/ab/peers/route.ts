import { NextResponse } from 'next/server'
import { peerPayload, requireBook } from '@/lib/address-book'
import { clientRoute } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Записи книги: /api/ab/peers?ab=<guid>&current=1&pageSize=100 */
export const POST = clientRoute(async ({ user }, request) => {
  const url = new URL(request.url)
  const book = await requireBook(user, url.searchParams.get('ab') ?? '', 1)
  const current = Math.max(1, Number(url.searchParams.get('current')) || 1)
  const pageSize = Math.min(1000, Math.max(1, Number(url.searchParams.get('pageSize')) || 100))
  const page = book.peers.slice((current - 1) * pageSize, current * pageSize)
  return NextResponse.json({ total: book.peers.length, data: page.map(peerPayload) })
})
