import { NextResponse } from 'next/server'
import { ensurePersonalBook } from '@/lib/address-book'
import { clientRoute } from '@/lib/client-api'
import { serverInfo, webPeer } from '@/lib/webclient'

export const dynamic = 'force-dynamic'

/** Веб-клиент после входа: сервер, ключ и личная адресная книга. */
export const POST = clientRoute(async ({ user }) => {
  const book = await ensurePersonalBook(user)
  const peers = Object.fromEntries(book.peers.slice(0, 500).map((peer) => [peer.id, webPeer(peer)]))
  return NextResponse.json({ code: 0, message: 'success', data: { ...serverInfo(), peers } })
})
