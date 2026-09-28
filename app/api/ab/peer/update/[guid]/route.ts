import { requireBook, updatePeer } from '@/lib/address-book'
import { clientRoute, emptyOk, readJson } from '@/lib/client-api'

export const dynamic = 'force-dynamic'

/** Клиент меняет у записи имя, метки, заметку и сохранённый пароль. */
export const PUT = clientRoute(async ({ user }, request, { guid }) => {
  await requireBook(user, guid, 2)
  await updatePeer(guid, (await readJson(request)) ?? {})
  return emptyOk()
})
