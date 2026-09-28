import { NextResponse } from 'next/server'
import {
  AbError,
  addDevicesToBook,
  addPeer,
  addTag,
  createBook,
  deleteBook,
  deletePeers,
  deleteTags,
  leaveBook,
  recolorTag,
  renameBook,
  renameTag,
  requireBook,
  shareBook,
  updatePeer,
} from '@/lib/address-book'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Метки из формы: «работа, офис» → ['работа', 'офис']. */
function tagsFrom(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(',').map((tag) => tag.trim()).filter(Boolean)
  return undefined
}

/** Цвет из <input type="color"> (#rrggbb) → цвет Flutter 0xFFRRGGBB. */
function colorFrom(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return (0xff000000 + Number.parseInt(value.slice(1), 16)) >>> 0
  return undefined
}

/** Поля записи, которые можно менять в кабинете. */
const CABINET_PEER_FIELDS = ['alias', 'tags', 'note', 'hostname', 'username', 'platform'] as const

/**
 * Адресные книги в личном кабинете. Одна точка, действие — в поле action.
 * Права те же, что у клиента: запись — с уровня «чтение и запись»,
 * удаление — с «полного доступа», настройки книги — только владелец.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const guid = String(body.guid ?? '')
  const action = String(body.action ?? '')

  try {
    switch (action) {
      case 'create': {
        const book = await createBook(user, body.name)
        return NextResponse.json({ ok: true, guid: book.guid })
      }
      case 'rename':
        await renameBook(user, guid, body.name)
        break
      case 'delete':
        await deleteBook(user, guid)
        break
      case 'leave':
        await leaveBook(user, guid)
        break
      case 'share':
        await shareBook(user, guid, String(body.email ?? ''), Number(body.rule))
        break
      case 'peer-add': {
        await requireBook(user, guid, 2)
        await addPeer(guid, { ...body, tags: tagsFrom(body.tags) ?? [] })
        break
      }
      case 'peer-update': {
        await requireBook(user, guid, 2)
        const input: Record<string, unknown> = { ...body }
        if ('tags' in body) input.tags = tagsFrom(body.tags) ?? []
        await updatePeer(guid, input, CABINET_PEER_FIELDS)
        break
      }
      case 'peer-delete':
        await requireBook(user, guid, 3)
        await deletePeers(guid, [String(body.id ?? '')])
        break
      case 'peers-from-devices': {
        await requireBook(user, guid, 2)
        return NextResponse.json({ ok: true, added: await addDevicesToBook(guid, user.id) })
      }
      case 'tag-add':
        await requireBook(user, guid, 2)
        await addTag(guid, { name: body.name, color: colorFrom(body.color) })
        break
      case 'tag-rename':
        await requireBook(user, guid, 2)
        await renameTag(guid, { old: body.old, new: body.new })
        break
      case 'tag-color':
        await requireBook(user, guid, 2)
        await recolorTag(guid, { name: body.name, color: colorFrom(body.color) })
        break
      case 'tag-delete':
        await requireBook(user, guid, 3)
        await deleteTags(guid, [String(body.name ?? '')])
        break
      default:
        return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AbError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[address-books]', error)
    return NextResponse.json({ error: 'Не удалось выполнить действие' }, { status: 500 })
  }
}
