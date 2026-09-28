import { addPeer, requireBook } from '@/lib/address-book'
import { clientRoute, emptyOk, readJson } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

export const POST = clientRoute(async ({ user }, request, { guid }) => {
  await requireBook(user, guid, 2)
  await addPeer(guid, (await readJson(request)) ?? {})
  return emptyOk()
})
