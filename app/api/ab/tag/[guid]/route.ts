import { deleteTags, requireBook } from '@/lib/address-book'
import { clientRoute, emptyOk, readJson } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Удаление меток: тело — массив названий. */
export const DELETE = clientRoute(async ({ user }, request, { guid }) => {
  await requireBook(user, guid, 3)
  await deleteTags(guid, await readJson(request))
  return emptyOk()
})
