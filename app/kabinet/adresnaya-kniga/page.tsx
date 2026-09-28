import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ActionButton } from '@/components/admin/action-button'
import { JsonForm, inputClass } from '@/components/cabinet/json-form'
import { accessibleBooks, RULE_NAMES } from '@/lib/address-book'
import { getCurrentUser } from '@/lib/auth'
import { config } from '@/lib/config'
import { getStore } from '@/lib/store'
import type { AbTag } from '@/lib/types'

export const metadata: Metadata = { title: 'Адресная книга' }
export const dynamic = 'force-dynamic'

const API = '/api/v1/address-books'

/** Цвет Flutter 0xAARRGGBB → #rrggbb для CSS и <input type="color">. */
function cssColor(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`
}

export default async function AddressBookPage({ searchParams }: { searchParams: Promise<{ ab?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const { ab } = await searchParams
  const books = await accessibleBooks(user)
  const current = books.find(({ book }) => book.guid === ab) ?? books[0]
  const { book, rule, owner } = current
  const canWrite = rule >= 2
  const canDelete = rule >= 3

  const store = await getStore()
  const people = new Map<string, string>()
  for (const id of new Set([...books.map(({ book: item }) => item.ownerId), ...book.shares.map((share) => share.userId)])) {
    people.set(id, id === user.id ? user.email : ((await store.findUserById(id))?.email ?? 'удалённый аккаунт'))
  }
  const colors = new Map<string, AbTag>(book.tags.map((tag) => [tag.name, tag]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Адресная книга</h1>
        <p className="mt-1 text-sm text-text-muted">
          Те же записи, что во вкладке «Адресная книга» в клиенте {config.brand.name}: правки здесь появляются в
          клиенте и наоборот.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {books.map(({ book: item, owner: mine }) => (
          <Link
            key={item.guid}
            href={`/kabinet/adresnaya-kniga?ab=${item.guid}`}
            className={`rounded-xl border px-3.5 py-2 text-sm transition-colors ${
              item.guid === book.guid
                ? 'border-brand-500 bg-brand-500/10 text-text-primary'
                : 'border-white/10 text-text-secondary hover:border-white/25 hover:text-text-primary'
            }`}
          >
            {item.name}
            <span className="ml-2 text-xs text-text-muted">
              {item.personal ? 'личная' : mine ? 'общая' : `от ${people.get(item.ownerId)}`} · {item.peers.length}
            </span>
          </Link>
        ))}
      </div>

      {!owner && (
        <p className="rounded-xl border border-white/8 px-4 py-3 text-sm text-text-secondary">
          Книгу открыл вам {people.get(book.ownerId)}, ваш доступ — {RULE_NAMES[rule]}.
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Записи · {book.peers.length}</h2>
        </div>
        {book.peers.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-text-muted">
            Пока пусто. Добавьте устройство ниже или в клиенте: «Адресная книга» → «Добавить ID».
          </p>
        ) : (
          <ul className="divide-y divide-white/8">
            {book.peers.map((peer) => (
              <li key={peer.id} className="px-6 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary">
                      <span className="font-mono">{peer.id}</span>
                      {peer.alias && <span className="ml-2">{peer.alias}</span>}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {[peer.hostname, peer.username, peer.platform].filter(Boolean).join(' · ') || 'нет сведений об устройстве'}
                    </p>
                    {peer.tags.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-1.5">
                        {peer.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md px-2 py-0.5 text-xs text-white"
                            style={{ backgroundColor: cssColor(colors.get(tag)?.color ?? 0xff2196f3) }}
                          >
                            {tag}
                          </span>
                        ))}
                      </p>
                    )}
                    {peer.note && <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{peer.note}</p>}
                  </div>
                  {canDelete && (
                    <ActionButton
                      endpoint={API}
                      body={{ action: 'peer-delete', guid: book.guid, id: peer.id }}
                      label="Удалить"
                      variant="danger"
                      confirm={`Удалить ${peer.alias || peer.id} из книги?`}
                    />
                  )}
                </div>
                {canWrite && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-text-muted hover:text-text-primary">Изменить</summary>
                    <JsonForm
                      endpoint={API}
                      body={{ action: 'peer-update', guid: book.guid, id: peer.id }}
                      submitLabel="Сохранить"
                      className="mt-3 grid gap-3 sm:grid-cols-2"
                    >
                      <input name="alias" defaultValue={peer.alias} placeholder="Имя в книге" className={inputClass} />
                      <input
                        name="tags"
                        defaultValue={peer.tags.join(', ')}
                        placeholder="Метки через запятую"
                        className={inputClass}
                      />
                      <textarea
                        name="note"
                        defaultValue={peer.note}
                        placeholder="Заметка"
                        rows={2}
                        className={`${inputClass} h-auto py-2 sm:col-span-2`}
                      />
                    </JsonForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && (
        <div className="card p-6">
          <h2 className="font-semibold">Добавить устройство</h2>
          <JsonForm
            endpoint={API}
            body={{ action: 'peer-add', guid: book.guid }}
            submitLabel="Добавить"
            reset
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <input name="id" required placeholder="ID устройства" inputMode="numeric" className={`${inputClass} font-mono`} />
            <input name="alias" placeholder="Имя в книге" className={inputClass} />
            <input name="tags" placeholder="Метки через запятую" className={`${inputClass} sm:col-span-2`} />
          </JsonForm>
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-semibold">Метки · {book.tags.length}</h2>
        {book.tags.length > 0 && (
          <ul className="mt-4 space-y-3">
            {book.tags.map((tag) => (
              <li key={tag.name} className="flex flex-wrap items-center gap-3">
                <span
                  className="rounded-md px-2 py-0.5 text-sm text-white"
                  style={{ backgroundColor: cssColor(tag.color) }}
                >
                  {tag.name}
                </span>
                {canWrite && (
                  <JsonForm
                    endpoint={API}
                    body={{ action: 'tag-color', guid: book.guid, name: tag.name }}
                    submitLabel="Цвет"
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    <input
                      type="color"
                      name="color"
                      defaultValue={cssColor(tag.color)}
                      className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                      aria-label={`Цвет метки ${tag.name}`}
                    />
                  </JsonForm>
                )}
                {canWrite && (
                  <JsonForm
                    endpoint={API}
                    body={{ action: 'tag-rename', guid: book.guid, old: tag.name }}
                    submitLabel="Переименовать"
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    <input name="new" required defaultValue={tag.name} className={`${inputClass} w-40`} aria-label="Новое название" />
                  </JsonForm>
                )}
                {canDelete && (
                  <ActionButton
                    endpoint={API}
                    body={{ action: 'tag-delete', guid: book.guid, name: tag.name }}
                    label="Удалить"
                    variant="danger"
                    confirm={`Удалить метку «${tag.name}»? С записей она тоже снимется.`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <JsonForm
            endpoint={API}
            body={{ action: 'tag-add', guid: book.guid }}
            submitLabel="Добавить метку"
            reset
            variant="secondary"
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <input name="name" required placeholder="Новая метка" className={`${inputClass} w-48`} />
            <input
              type="color"
              name="color"
              defaultValue="#2196f3"
              className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent"
              aria-label="Цвет"
            />
          </JsonForm>
        )}
      </div>

      {owner && !book.personal && (
        <div className="card p-6">
          <h2 className="font-semibold">Доступ к книге</h2>
          <p className="mt-1.5 text-sm text-text-secondary">
            Книга появится у этих людей в клиенте во вкладке «Адресная книга». Им нужен свой аккаунт {config.brand.name}.
          </p>
          {book.shares.length > 0 && (
            <ul className="mt-4 divide-y divide-white/8">
              {book.shares.map((share) => (
                <li key={share.userId} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{people.get(share.userId)}</span>
                  <span className="text-sm text-text-muted">{RULE_NAMES[share.rule]}</span>
                  <ActionButton
                    endpoint={API}
                    body={{ action: 'share', guid: book.guid, email: people.get(share.userId), rule: 0 }}
                    label="Закрыть доступ"
                    variant="danger"
                  />
                </li>
              ))}
            </ul>
          )}
          <JsonForm
            endpoint={API}
            body={{ action: 'share', guid: book.guid }}
            submitLabel="Открыть доступ"
            reset
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <input name="email" type="email" required placeholder="Почта аккаунта" className={`${inputClass} w-64`} />
            <select name="rule" defaultValue="1" className={`${inputClass} w-48`}>
              <option value="1">{RULE_NAMES[1]}</option>
              <option value="2">{RULE_NAMES[2]}</option>
              <option value="3">{RULE_NAMES[3]}</option>
            </select>
          </JsonForm>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-semibold">Новая общая книга</h2>
          <p className="mt-1.5 text-sm text-text-secondary">
            Например, для клиентов или отдела — и откройте к ней доступ коллегам.
          </p>
          <JsonForm
            endpoint={API}
            body={{ action: 'create' }}
            submitLabel="Создать"
            reset
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <input name="name" required maxLength={60} placeholder="Название" className={`${inputClass} w-64`} />
          </JsonForm>
        </div>

        {!book.personal && (
          <div className="card p-6">
            <h2 className="font-semibold">Эта книга</h2>
            {owner ? (
              <div className="mt-4 space-y-4">
                <JsonForm
                  endpoint={API}
                  body={{ action: 'rename', guid: book.guid }}
                  submitLabel="Переименовать"
                  variant="secondary"
                  className="flex flex-wrap items-center gap-2"
                >
                  <input name="name" required maxLength={60} defaultValue={book.name} className={`${inputClass} w-64`} />
                </JsonForm>
                <ActionButton
                  endpoint={API}
                  body={{ action: 'delete', guid: book.guid }}
                  label="Удалить книгу"
                  variant="danger"
                  confirm={`Удалить книгу «${book.name}» со всеми записями? Она пропадёт и у тех, кому вы открыли доступ.`}
                />
              </div>
            ) : (
              <div className="mt-4">
                <ActionButton
                  endpoint={API}
                  body={{ action: 'leave', guid: book.guid }}
                  label="Отказаться от книги"
                  variant="danger"
                  confirm={`Убрать книгу «${book.name}» из вашего списка?`}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
