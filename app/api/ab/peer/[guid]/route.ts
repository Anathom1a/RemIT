import { deletePeers, requireBook } from '@/lib/address-book'
import { clientRoute, emptyOk, readJson } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Удаление записей: тело — массив ID. */
export const DELETE = clientRoute(async ({ user }, request, { guid }) => {
  await requireBook(user, guid, 3)
  await deletePeers(guid, await readJson(request))
  return emptyOk()
})
