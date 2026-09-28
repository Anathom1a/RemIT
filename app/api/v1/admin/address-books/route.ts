import { NextResponse } from 'next/server'
import {
  AbError,
  addDevicesToBook,
  addPeer,
  addTag,
  createBook,
  deleteBookByGuid,
  deletePeers,
  deleteTags,
  recolorTag,
  renameBookByGuid,
  renameTag,
  setBookShare,
  updatePeer,
} from '@/lib/address-book'
import { denyIfNotAdmin } from '@/lib/admin'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

function tagsFrom(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(',').map((tag) => tag.trim()).filter(Boolean)
  return undefined
}

function colorFrom(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return (0xff000000 + Number.parseInt(value.slice(1), 16)) >>> 0
  return undefined
}

const PEER_FIELDS = ['alias', 'tags', 'note', 'hostname', 'username', 'platform'] as const

/**
 * Адресные книги из админки: те же действия, что у владельца в кабинете,
 * для любой книги. create — новая общая книга для аккаунта userId.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const guid = String(body.guid ?? '')
  const store = await getStore()
  const book = guid ? await store.findAddressBook(guid) : null
  if (body.action !== 'create' && !book) return NextResponse.json({ error: 'Адресная книга не найдена' }, { status: 404 })

  try {
    switch (body.action) {
      case 'create': {
        const owner = await store.findUserById(String(body.userId ?? ''))
        if (!owner || owner.status === 'deleted') return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
        const created = await createBook(owner, body.name)
        return NextResponse.json({ ok: true, guid: created.guid })
      }
      case 'rename':
        await renameBookByGuid(guid, body.name)
        break
      case 'delete':
        await deleteBookByGuid(guid)
        break
      case 'share':
        await setBookShare(guid, String(body.email ?? ''), Number(body.rule))
        break
      case 'peer-add':
        await addPeer(guid, { ...body, tags: tagsFrom(body.tags) ?? [] })
        break
      case 'peer-update': {
        const input: Record<string, unknown> = { ...body }
        if ('tags' in body) input.tags = tagsFrom(body.tags) ?? []
        await updatePeer(guid, input, PEER_FIELDS)
        break
      }
      case 'peer-delete':
        await deletePeers(guid, [String(body.id ?? '')])
        break
      case 'peers-from-devices':
        return NextResponse.json({ ok: true, added: await addDevicesToBook(guid, book!.ownerId) })
      case 'tag-add':
        await addTag(guid, { name: body.name, color: colorFrom(body.color) })
        break
      case 'tag-rename':
        await renameTag(guid, { old: body.old, new: body.new })
        break
      case 'tag-color':
        await recolorTag(guid, { name: body.name, color: colorFrom(body.color) })
        break
      case 'tag-delete':
        await deleteTags(guid, [String(body.name ?? '')])
        break
      default:
        return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AbError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}
