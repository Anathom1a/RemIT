import { disableAutopay } from './billing'
import { getStore } from './store'
import type { User } from './types'

/**
 * Жизненный цикл аккаунта: блокировка администратором и удаление.
 *
 * Блокировка запрещает вход на сайте и в клиенте и сразу завершает все
 * входы. Удаление стирает личные данные (почту, имя, пароль, адресные книги,
 * привязки), но запись аккаунта и его платежи остаются — они нужны для
 * бухгалтерского учёта.
 */

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

async function endAllSessions(userId: string): Promise<void> {
  const store = await getStore()
  const now = new Date().toISOString()
  await store.deleteUserAuthSessions(userId)
  await store.revokeUserClientTokens(userId, now)
  await store.invalidatePasswordResets(userId, now)
}

export async function setBlocked(userId: string, blocked: boolean): Promise<User> {
  const store = await getStore()
  const user = await store.findUserById(userId)
  if (!user || user.status === 'deleted') throw new AccountError('Пользователь не найден', 404)
  const updated: User = { ...user, status: blocked ? 'blocked' : 'active' }
  await store.updateUser(updated)
  if (blocked) await endAllSessions(userId)
  return updated
}

export async function deleteAccount(userId: string): Promise<void> {
  const store = await getStore()
  const user = await store.findUserById(userId)
  if (!user || user.status === 'deleted') throw new AccountError('Пользователь не найден', 404)

  await endAllSessions(userId)

  // Адресные книги: свои удаляем, из чужих убираем доступ.
  for (const book of await store.listAddressBooksByOwner(userId)) await store.deleteAddressBook(book.guid)
  for (const book of await store.listAddressBooksSharedWith(userId)) {
    await store.updateAddressBook(book.guid, (current) => ({
      ...current,
      shares: current.shares.filter((share) => share.userId !== userId),
    }))
  }

  // Команда: владелец уносит её с собой, участник просто выходит.
  const team = await store.findTeamOfUser(userId)
  if (team?.member.role === 'owner') await store.deleteTeam(team.team.id)
  else if (team) await store.removeTeamMember(team.team.id, userId)

  for (const device of await store.listDevicesByUser(userId)) await store.setDeviceOwner(device.rustdeskId, null)
  for (const identity of await store.listOAuthIdentities(userId)) await store.deleteOAuthIdentity(identity.provider, userId)
  await store.deleteWebSharesByUser(userId)
  // Реквизиты организации: в оплаченных счетах и актах остаётся их копия.
  await store.deleteCompany(userId)
  // Сохранённую карту забываем: после удаления аккаунта списаний не будет.
  await disableAutopay(userId, 'аккаунт удалён')

  await store.updateUser({
    ...user,
    email: `deleted-${user.id}@deleted.invalid`,
    emailVerifiedAt: null,
    name: '',
    passwordHash: '',
    role: 'user',
    status: 'deleted',
  })
}

/** Текст для заблокированного аккаунта — один для сайта и клиента. */
export const BLOCKED_MESSAGE = 'Аккаунт заблокирован. Напишите в поддержку, если это ошибка.'
