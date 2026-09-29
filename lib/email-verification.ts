import { createHash, randomBytes } from 'node:crypto'
import { config } from './config'
import { escapeHtml, sendMail } from './mail'
import { getStore } from './store'
import type { User } from './types'

/**
 * Подтверждение почты. Без него нельзя оплатить: на почту приходят кассовые
 * чеки и предупреждения об автосписании, и адрес с опечаткой их потеряет.
 * Ссылка одноразовая, действует 3 суток; писем — не больше 3 в час на аккаунт.
 */

const LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000
const MAX_PER_HOUR = 3

export class VerificationLimitError extends Error {}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const verificationRequired = () => config.auth.emailVerification === 'required'

/** Текст для кнопок оплаты, пока почта не подтверждена; null — можно платить. */
export function paymentBlockedReason(user: User): string | null {
  if (!verificationRequired() || user.emailVerifiedAt) return null
  return `Подтвердите почту ${user.email}: на неё придут кассовые чеки. Ссылка — в письме после регистрации; прислать ещё раз можно в кабинете.`
}

function verificationEmail(user: User, link: string) {
  const brand = config.brand.name
  const greeting = `Здравствуйте${user.name ? `, ${user.name}` : ''}!`
  const text = [
    greeting,
    '',
    `Подтвердите почту ${user.email} для аккаунта ${brand} — откройте ссылку:`,
    '',
    link,
    '',
    'Ссылка действует 3 дня. На эту почту будут приходить кассовые чеки и важные уведомления.',
    'Если вы не регистрировались, просто удалите письмо.',
    '',
    `— ${brand}, ${config.brand.domain}`,
  ].join('\n')
  const html = `<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;color:#1a1d21;line-height:1.5">
<p>${escapeHtml(greeting)}</p>
<p>Подтвердите почту <b>${escapeHtml(user.email)}</b> для аккаунта ${escapeHtml(brand)}.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#3457D5;color:#fff;border-radius:8px;text-decoration:none">Подтвердить почту</a></p>
<p style="color:#5b6470;font-size:13px">Ссылка действует 3 дня. Если кнопка не нажимается, скопируйте адрес:<br>${escapeHtml(link)}</p>
<p style="color:#5b6470;font-size:13px">Если вы не регистрировались, просто удалите письмо.</p>
<p style="color:#5b6470;font-size:13px">— ${escapeHtml(brand)}, ${escapeHtml(config.brand.domain)}</p>
</body></html>`
  return { subject: `Подтвердите почту для ${brand}`, text, html }
}

// Проверка лимита и создание ссылки — по очереди для одного аккаунта.
const queue = new Map<string, Promise<unknown>>()

/**
 * Отправляет письмо со ссылкой. Бросает VerificationLimitError, если писем
 * за час уже слишком много. Уже подтверждённой почте ничего не шлёт.
 */
export async function sendVerification(user: User, now = new Date()): Promise<boolean> {
  if (user.emailVerifiedAt) return false
  const store = await getStore()
  const previous = queue.get(user.id) ?? Promise.resolve()
  const task = previous.then(async () => {
    const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    if ((await store.countRecentEmailVerifications(user.id, since)) >= MAX_PER_HOUR) {
      throw new VerificationLimitError('Писем уже отправлено много — попробуйте через час или проверьте папку «Спам».')
    }
    const token = randomBytes(32).toString('base64url')
    await store.createEmailVerification({
      tokenHash: hashToken(token),
      userId: user.id,
      email: user.email,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LINK_TTL_MS).toISOString(),
      usedAt: null,
    })
    const site = config.rustdesk.apiServer.replace(/\/+$/, '') || `https://${config.brand.domain}`
    return `${site}/podtverzhdenie/${token}`
  })
  const tail = task.catch(() => undefined)
  queue.set(user.id, tail)
  tail.then(() => {
    if (queue.get(user.id) === tail) queue.delete(user.id)
  })
  const link = await task
  return sendMail({ to: user.email, ...verificationEmail(user, link) })
}

export type ConfirmResult = { ok: true; user: User; already: boolean } | { ok: false; error: string }

/** Подтверждение по ссылке из письма. */
export async function confirmEmail(token: string, now = new Date()): Promise<ConfirmResult> {
  const store = await getStore()
  const record = token ? await store.consumeEmailVerification(hashToken(token), now.toISOString()) : null
  if (!record) return { ok: false, error: 'Ссылка устарела или уже использована.' }
  const user = await store.findUserById(record.userId)
  if (!user || user.status !== 'active') return { ok: false, error: 'Аккаунт не найден или заблокирован.' }
  if (user.email !== record.email) return { ok: false, error: 'Почта аккаунта с тех пор изменилась — запросите новую ссылку.' }
  if (user.emailVerifiedAt) return { ok: true, user, already: true }
  const verified: User = { ...user, emailVerifiedAt: now.toISOString() }
  await store.updateUser(verified)
  return { ok: true, user: verified, already: false }
}

/** Подтверждение вручную (админка): человек написал с этого адреса в поддержку. */
export async function markEmailVerified(userId: string, now = new Date()): Promise<User | null> {
  const store = await getStore()
  const user = await store.findUserById(userId)
  if (!user) return null
  if (user.emailVerifiedAt) return user
  const verified: User = { ...user, emailVerifiedAt: now.toISOString() }
  await store.updateUser(verified)
  return verified
}
