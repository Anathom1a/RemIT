import { createHash, randomBytes } from 'node:crypto'
import { createUserSession, hashPassword, normalizeEmail } from './auth'
import { config } from './config'
import { escapeHtml, sendMail } from './mail'
import { getStore } from './store'
import type { PasswordReset, User } from './types'

/**
 * Восстановление пароля по одноразовой ссылке из письма.
 *
 * Ссылка живёт час и гасится при первом использовании. В базе лежит только
 * хеш токена. После смены пароля все сессии пользователя закрываются: если
 * пароль меняли, потому что его узнал кто-то ещё, этот кто-то вылетит.
 */

export const RESET_TTL_MS = 60 * 60 * 1000
/** Сколько писем со ссылкой отправляем на один аккаунт в час. */
const MAX_PER_ACCOUNT_PER_HOUR = 3
export const MIN_PASSWORD_LENGTH = 8

function hashResetToken(token: string): string {
  return createHash('sha256').update(`reset:${token}:${config.auth.secret}`).digest('hex')
}

function siteUrl(): string {
  return config.rustdesk.apiServer.replace(/\/$/, '') || `https://${config.brand.domain}`
}

/** Создаёт ссылку и возвращает её полный адрес. */
export async function createResetLink(userId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const reset: PasswordReset = {
    tokenHash: hashResetToken(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RESET_TTL_MS).toISOString(),
    usedAt: null,
  }
  const store = await getStore()
  await store.createPasswordReset(reset)
  return `${siteUrl()}/vosstanovlenie/${token}`
}

function resetEmail(user: User, link: string): { subject: string; text: string; html: string } {
  const brand = config.brand.name
  const subject = `Восстановление пароля ${brand}`
  const text = [
    `Здравствуйте${user.name ? `, ${user.name}` : ''}!`,
    '',
    `Кто-то — надеемся, вы — запросил сброс пароля для аккаунта ${user.email} в ${brand}.`,
    'Чтобы задать новый пароль, откройте ссылку:',
    '',
    link,
    '',
    'Ссылка действует один час и сработает один раз.',
    'Если вы ничего не запрашивали, просто удалите это письмо: пароль останется прежним.',
    '',
    `— ${brand}, ${config.brand.domain}`,
  ].join('\n')

  const html = `<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;color:#1a1d21;line-height:1.5">
<p>Здравствуйте${user.name ? `, ${escapeHtml(user.name)}` : ''}!</p>
<p>Кто-то — надеемся, вы — запросил сброс пароля для аккаунта <b>${escapeHtml(user.email)}</b> в ${escapeHtml(brand)}.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none">Задать новый пароль</a></p>
<p style="color:#5b6470;font-size:13px">Ссылка действует один час и сработает один раз. Если кнопка не нажимается, скопируйте адрес:<br>${escapeHtml(link)}</p>
<p style="color:#5b6470;font-size:13px">Если вы ничего не запрашивали, просто удалите это письмо: пароль останется прежним.</p>
<p style="color:#5b6470;font-size:13px">— ${escapeHtml(brand)}, ${escapeHtml(config.brand.domain)}</p>
</body></html>`

  return { subject, text, html }
}

/**
 * Запрос сброса. Ничего не возвращает намеренно: ответ пользователю одинаков,
 * есть такой аккаунт или нет, — иначе форма превращается в проверку, чья
 * почта у нас зарегистрирована.
 */
export async function requestPasswordReset(rawEmail: string, now = new Date()): Promise<void> {
  const store = await getStore()
  const user = await store.findUserByEmail(normalizeEmail(rawEmail))
  if (!user) return

  // Проверка лимита и создание ссылки — по очереди для одного аккаунта: иначе
  // несколько запросов подряд одновременно видят «ещё можно» и шлют лишние письма.
  const previous = resetQueue.get(user.id) ?? Promise.resolve()
  const task = previous.then(async () => {
    const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    if ((await store.countRecentPasswordResets(user.id, since)) >= MAX_PER_ACCOUNT_PER_HOUR) return null
    return createResetLink(user.id, now)
  })
  const tail = task.then(() => undefined, () => undefined)
  resetQueue.set(user.id, tail)
  tail.then(() => {
    if (resetQueue.get(user.id) === tail) resetQueue.delete(user.id)
  })

  const link = await task
  if (link) await sendMail({ to: user.email, ...resetEmail(user, link) })
}

const resetQueue = new Map<string, Promise<void>>()

/** Действует ли ссылка — чтобы сразу сказать об устаревшей, а не после ввода пароля. */
export async function isResetTokenValid(token: string, now = new Date()): Promise<boolean> {
  if (!token) return false
  const store = await getStore()
  return Boolean(await store.findPasswordReset(hashResetToken(token), now.toISOString()))
}

export type ResetResult =
  | { ok: true; user: User; sessionToken: string }
  | { ok: false; error: string }

/** Смена пароля по ссылке. При успехе пользователь сразу входит в кабинет. */
export async function completePasswordReset(token: string, password: string, now = new Date()): Promise<ResetResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` }
  }

  const store = await getStore()
  const nowIso = now.toISOString()
  const reset = token ? await store.consumePasswordReset(hashResetToken(token), nowIso) : null
  if (!reset) {
    return { ok: false, error: 'Ссылка устарела или уже использована. Запросите новую.' }
  }

  const user = await store.findUserById(reset.userId)
  if (!user) return { ok: false, error: 'Аккаунт не найден' }

  const updated: User = { ...user, passwordHash: await hashPassword(password) }
  await store.updateUser(updated)
  // Остальные ссылки из прошлых писем больше не нужны, старые сессии — тоже.
  await store.invalidatePasswordResets(user.id, nowIso)
  await store.deleteUserAuthSessions(user.id)
  // Аккаунт общий с клиентом: сброс завершает и входы в клиенте.
  await store.revokeUserClientTokens(user.id, nowIso)

  const sessionToken = await createUserSession(user.id)
  return { ok: true, user: updated, sessionToken }
}
