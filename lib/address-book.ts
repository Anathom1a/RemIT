import { newId } from './auth'
import { getStore } from './store'
import type { AbPeer, AbRule, AbTag, AddressBook, User } from './types'

/**
 * Адресные книги клиента RustDesk.
 *
 * У каждого аккаунта есть личная книга — её клиент показывает как «Моя
 * адресная книга». Можно завести общие книги и выдать к ним доступ другим
 * аккаунтам по почте: чтение, чтение и запись, полный доступ. Клиент и
 * кабинет работают с одними и теми же данными.
 */

export class AbError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

export const MAX_PEERS_PER_BOOK = 5000
export const MAX_TAGS_PER_BOOK = 200
export const MAX_BOOKS_PER_USER = 50
export const RULE_NAMES: Record<AbRule, string> = { 1: 'чтение', 2: 'чтение и запись', 3: 'полный доступ' }

const str = (value: unknown, max = 200): string => (typeof value === 'string' ? value.slice(0, max) : '')

function newBook(owner: User, name: string, personal: boolean): AddressBook {
  const now = new Date().toISOString()
  return {
    guid: newId('ab'),
    ownerId: owner.id,
    name,
    personal,
    note: '',
    peers: [],
    tags: [],
    shares: [],
    createdAt: now,
    updatedAt: now,
  }
}

export async function ensurePersonalBook(user: User): Promise<AddressBook> {
  const store = await getStore()
  const existing = await store.findPersonalAddressBook(user.id)
  if (existing) return existing
  const book = newBook(user, 'Личная книга', true)
  if (await store.createAddressBook(book)) return book
  // Два первых запроса пришли одновременно — книгу уже завёл соседний.
  const created = await store.findPersonalAddressBook(user.id)
  if (!created) throw new AbError('Не удалось создать адресную книгу', 500)
  return created
}

export interface BookAccess {
  book: AddressBook
  rule: AbRule
  owner: boolean
}

/** Книги, которые видит пользователь: свои (полный доступ) и выданные ему. */
export async function accessibleBooks(user: User): Promise<BookAccess[]> {
  const store = await getStore()
  await ensurePersonalBook(user)
  const [own, shared] = await Promise.all([
    store.listAddressBooksByOwner(user.id),
    store.listAddressBooksSharedWith(user.id),
  ])
  return [
    ...own.map((book) => ({ book, rule: 3 as AbRule, owner: true })),
    ...shared.map((book) => ({
      book,
      rule: book.shares.find((share) => share.userId === user.id)!.rule,
      owner: false,
    })),
  ]
}

export async function bookAccess(user: User, guid: string): Promise<BookAccess | null> {
  if (!guid) return null
  const store = await getStore()
  const book = await store.findAddressBook(guid)
  if (!book) return null
  if (book.ownerId === user.id) return { book, rule: 3, owner: true }
  const share = book.shares.find((item) => item.userId === user.id)
  return share ? { book, rule: share.rule, owner: false } : null
}

/** Доступ с проверкой уровня: 1 — чтение, 2 — запись, 3 — удаление и настройки. */
export async function requireBook(user: User, guid: string, need: AbRule): Promise<AddressBook> {
  const access = await bookAccess(user, guid)
  if (!access) throw new AbError('Адресная книга не найдена', 404)
  if (access.rule < need) throw new AbError('Нет доступа', 403)
  return access.book
}

async function mutate(guid: string, change: (book: AddressBook) => void): Promise<AddressBook> {
  const store = await getStore()
  const updated = await store.updateAddressBook(guid, (book) => {
    change(book)
    book.updatedAt = new Date().toISOString()
    return book
  })
  if (!updated) throw new AbError('Адресная книга не найдена', 404)
  return updated
}

// --- Записи -----------------------------------------------------------------

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '').map((tag) => tag.trim().slice(0, 50)))]
}

const isTrue = (value: unknown) => value === true || value === 'true'

/** Запись из того, что прислал клиент или форма кабинета. */
export function peerFromInput(input: Record<string, unknown>, previous?: AbPeer): AbPeer {
  const id = str(input.id, 64).replace(/\s+/g, '')
  if (!id) throw new AbError('Укажите ID устройства')
  const pick = (key: keyof AbPeer, max = 200) => (key in input ? str(input[key], max) : ((previous?.[key] as string) ?? ''))
  return {
    id,
    alias: pick('alias', 100),
    username: pick('username', 100),
    hostname: pick('hostname', 100),
    platform: pick('platform', 30),
    tags: 'tags' in input ? cleanTags(input.tags) : (previous?.tags ?? []),
    hash: pick('hash', 200),
    password: pick('password', 200),
    forceAlwaysRelay: 'forceAlwaysRelay' in input ? isTrue(input.forceAlwaysRelay) : (previous?.forceAlwaysRelay ?? false),
    rdpPort: pick('rdpPort', 10),
    rdpUsername: pick('rdpUsername', 100),
    loginName: pick('loginName', 100),
    note: pick('note', 2000),
    updatedAt: new Date().toISOString(),
  }
}

/** Запись в формате клиента RustDesk. */
export function peerPayload(peer: AbPeer) {
  return {
    id: peer.id,
    hash: peer.hash,
    password: peer.password,
    username: peer.username,
    hostname: peer.hostname,
    platform: peer.platform,
    alias: peer.alias,
    tags: peer.tags,
    forceAlwaysRelay: String(peer.forceAlwaysRelay),
    rdpPort: peer.rdpPort,
    rdpUsername: peer.rdpUsername,
    loginName: peer.loginName,
    note: peer.note,
  }
}

const PLATFORMS: [RegExp, string][] = [
  [/windows/i, 'Windows'],
  [/mac|darwin/i, 'Mac OS'],
  [/android/i, 'Android'],
  [/linux|ubuntu|debian|fedora/i, 'Linux'],
]

export function platformFromOs(os: string): string {
  return PLATFORMS.find(([pattern]) => pattern.test(os))?.[1] ?? ''
}

/** Пустые имя компьютера, пользователь и платформу берём из сведений об устройстве. */
async function fillFromDevice(peer: AbPeer): Promise<AbPeer> {
  if (peer.platform && peer.username && peer.hostname) return peer
  const store = await getStore()
  const device = await store.findDeviceByRustdeskId(peer.id)
  if (!device) return peer
  return {
    ...peer,
    platform: peer.platform || platformFromOs(device.os),
    username: peer.username || device.osUsername,
    hostname: peer.hostname || device.name,
  }
}

export async function addPeer(guid: string, input: Record<string, unknown>): Promise<void> {
  const peer = await fillFromDevice(peerFromInput(input))
  await mutate(guid, (book) => {
    // Повторное добавление того же ID обновляет запись, а не плодит дубли.
    const index = book.peers.findIndex((item) => item.id === peer.id)
    if (index >= 0) {
      book.peers[index] = peerFromInput(input, book.peers[index])
    } else {
      if (book.peers.length >= MAX_PEERS_PER_BOOK) throw new AbError('В книге слишком много записей')
      book.peers.push(peer)
    }
    addMissingTags(book, peer.tags)
  })
}

/** Поля, которые меняет клиент при правке записи. */
const CLIENT_UPDATABLE = ['alias', 'tags', 'hash', 'password', 'note'] as const

export async function updatePeer(guid: string, input: Record<string, unknown>, fields?: readonly string[]): Promise<void> {
  const id = str(input.id, 64)
  if (!id) throw new AbError('Укажите ID устройства')
  const allowed = fields ?? CLIENT_UPDATABLE
  const patch: Record<string, unknown> = { id }
  for (const key of allowed) if (key in input) patch[key] = input[key]
  await mutate(guid, (book) => {
    const index = book.peers.findIndex((item) => item.id === id)
    if (index < 0) throw new AbError('Запись не найдена', 404)
    book.peers[index] = peerFromInput(patch, book.peers[index])
    addMissingTags(book, book.peers[index].tags)
  })
}

export async function deletePeers(guid: string, ids: unknown): Promise<void> {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new AbError('Неверный запрос')
  const remove = new Set(ids as string[])
  await mutate(guid, (book) => {
    book.peers = book.peers.filter((peer) => !remove.has(peer.id))
  })
}

// --- Метки ------------------------------------------------------------------

/** Цвет по умолчанию для новых меток — как у клиента. */
const DEFAULT_COLOR = 0xff2196f3

function addMissingTags(book: AddressBook, names: string[]): void {
  for (const name of names) {
    if (!book.tags.some((tag) => tag.name === name) && book.tags.length < MAX_TAGS_PER_BOOK) {
      book.tags.push({ name, color: DEFAULT_COLOR })
    }
  }
}

function tagName(value: unknown): string {
  const name = str(value, 50).trim()
  if (!name) throw new AbError('Укажите название метки')
  return name
}

function tagColor(value: unknown): number {
  const color = Number(value)
  return Number.isInteger(color) && color >= 0 && color <= 0xffffffff ? color : DEFAULT_COLOR
}

export async function addTag(guid: string, input: Record<string, unknown>): Promise<void> {
  const tag: AbTag = { name: tagName(input.name), color: tagColor(input.color) }
  await mutate(guid, (book) => {
    if (book.tags.some((item) => item.name === tag.name)) throw new AbError('Такая метка уже есть')
    if (book.tags.length >= MAX_TAGS_PER_BOOK) throw new AbError('Слишком много меток')
    book.tags.push(tag)
  })
}

export async function renameTag(guid: string, input: Record<string, unknown>): Promise<void> {
  const from = tagName(input.old)
  const to = tagName(input.new)
  await mutate(guid, (book) => {
    const tag = book.tags.find((item) => item.name === from)
    if (!tag) throw new AbError('Метка не найдена', 404)
    if (from !== to && book.tags.some((item) => item.name === to)) throw new AbError('Такая метка уже есть')
    tag.name = to
    for (const peer of book.peers) peer.tags = [...new Set(peer.tags.map((name) => (name === from ? to : name)))]
  })
}

export async function recolorTag(guid: string, input: Record<string, unknown>): Promise<void> {
  const name = tagName(input.name)
  await mutate(guid, (book) => {
    const tag = book.tags.find((item) => item.name === name)
    if (!tag) throw new AbError('Метка не найдена', 404)
    tag.color = tagColor(input.color)
  })
}

export async function deleteTags(guid: string, names: unknown): Promise<void> {
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) throw new AbError('Неверный запрос')
  const remove = new Set(names as string[])
  await mutate(guid, (book) => {
    book.tags = book.tags.filter((tag) => !remove.has(tag.name))
    for (const peer of book.peers) peer.tags = peer.tags.filter((name) => !remove.has(name))
  })
}

// --- Старый формат (/api/ab): вся личная книга одной строкой -----------------

export async function legacyBook(user: User): Promise<string> {
  const book = await ensurePersonalBook(user)
  const colors = Object.fromEntries(book.tags.map((tag) => [tag.name, tag.color]))
  return JSON.stringify({
    tags: book.tags.map((tag) => tag.name),
    peers: book.peers.map(peerPayload),
    tag_colors: JSON.stringify(colors),
  })
}

export async function saveLegacyBook(user: User, data: unknown): Promise<void> {
  if (typeof data !== 'string') throw new AbError('Неверный запрос')
  let parsed: { tags?: unknown; peers?: unknown; tag_colors?: unknown }
  let colors: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(data)
    if (typeof parsed.tag_colors === 'string' && parsed.tag_colors) colors = JSON.parse(parsed.tag_colors)
  } catch {
    throw new AbError('Неверный запрос')
  }
  const peers = Array.isArray(parsed.peers) ? parsed.peers : []
  if (peers.length > MAX_PEERS_PER_BOOK) throw new AbError('В книге слишком много записей')
  const book = await ensurePersonalBook(user)
  await mutate(book.guid, (current) => {
    const previous = new Map(current.peers.map((peer) => [peer.id, peer]))
    const seen = new Set<string>()
    current.peers = []
    for (const item of peers) {
      if (!item || typeof item !== 'object') continue
      const peer = peerFromInput(item as Record<string, unknown>, previous.get(String((item as { id?: unknown }).id ?? '')))
      if (seen.has(peer.id)) continue
      seen.add(peer.id)
      current.peers.push(peer)
    }
    const names = cleanTags(parsed.tags).slice(0, MAX_TAGS_PER_BOOK)
    current.tags = names.map((name) => ({ name, color: tagColor(colors[name] ?? DEFAULT_COLOR) }))
  })
}

// --- Книги и доступ (кабинет) ------------------------------------------------

function bookName(value: unknown): string {
  const name = str(value, 60).trim()
  if (!name) throw new AbError('Укажите название книги')
  return name
}

export async function createBook(user: User, name: unknown): Promise<AddressBook> {
  const store = await getStore()
  const own = await store.listAddressBooksByOwner(user.id)
  if (own.length >= MAX_BOOKS_PER_USER) throw new AbError('Слишком много адресных книг')
  const book = newBook(user, bookName(name), false)
  await store.createAddressBook(book)
  return book
}

export async function renameBook(user: User, guid: string, name: unknown): Promise<void> {
  const book = await requireBook(user, guid, 3)
  if (book.ownerId !== user.id) throw new AbError('Переименовать книгу может только владелец', 403)
  const next = bookName(name)
  await mutate(guid, (current) => {
    current.name = next
  })
}

export async function deleteBook(user: User, guid: string): Promise<void> {
  const book = await requireBook(user, guid, 3)
  if (book.ownerId !== user.id) throw new AbError('Удалить книгу может только владелец', 403)
  if (book.personal) throw new AbError('Личную книгу удалить нельзя')
  const store = await getStore()
  await store.deleteAddressBook(guid)
}

/** Выдаёт доступ аккаунту по почте; rule 0 — забирает. */
export async function shareBook(user: User, guid: string, email: string, rule: number): Promise<void> {
  const book = await requireBook(user, guid, 3)
  if (book.ownerId !== user.id) throw new AbError('Доступом управляет только владелец', 403)
  if (book.personal) throw new AbError('Личной книгой поделиться нельзя — заведите общую')
  const store = await getStore()
  const target = await store.findUserByEmail(email.trim().toLowerCase())
  if (!target) throw new AbError('Аккаунт с такой почтой не найден', 404)
  if (target.id === user.id) throw new AbError('Это ваш аккаунт')
  if (![0, 1, 2, 3].includes(rule)) throw new AbError('Неверный уровень доступа')
  await mutate(guid, (current) => {
    current.shares = current.shares.filter((share) => share.userId !== target.id)
    if (rule > 0) current.shares.push({ userId: target.id, rule: rule as AbRule })
  })
}

/** Отказ от чужой книги, выданной вам. */
export async function leaveBook(user: User, guid: string): Promise<void> {
  const access = await bookAccess(user, guid)
  if (!access || access.owner) throw new AbError('Адресная книга не найдена', 404)
  await mutate(guid, (current) => {
    current.shares = current.shares.filter((share) => share.userId !== user.id)
  })
}
