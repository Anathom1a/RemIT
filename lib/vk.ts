import { createHash, randomBytes } from 'node:crypto'
import { newId, normalizeEmail } from './auth'
import { config } from './config'
import { getRuntimeSettings } from './settings'
import { getStore } from './store'
import type { OAuthState, User } from './types'

/**
 * Вход через VK ID — OAuth 2.1 с PKCE:
 *   1. уводим человека на id.vk.com/authorize с code_challenge и state;
 *   2. VK возвращает на /api/v1/auth/vk/callback с code, state и device_id;
 *   3. меняем code на токен (POST /oauth2/auth с code_verifier и device_id)
 *      и берём профиль (POST /oauth2/user_info).
 *
 * Сценарии: вход на сайте, привязка VK к аккаунту из кабинета и вход в
 * клиенте RemIT (кнопка «VK ID»: клиент открывает браузер и опрашивает
 * /api/oidc/auth-query, пока вход не завершится).
 */

export const VK_PROVIDER = 'vk'
/** Название кнопки в клиенте; оно же — op в /api/oidc/auth. */
export const VK_CLIENT_OP = 'VK ID'
const STATE_TTL_MS = 10 * 60 * 1000

export class VkError extends Error {}

export function vkEnabled(): boolean {
  return Boolean(config.vk.clientId)
}

export function vkRedirectUri(): string {
  return config.vk.redirectUri || `https://${config.brand.domain}/api/v1/auth/vk/callback`
}

function base(): string {
  return config.vk.baseUrl.replace(/\/$/, '')
}

/** Начало входа: сохраняет state и возвращает адрес страницы VK ID. */
export async function beginVk(params: {
  action: OAuthState['action']
  userId?: string | null
  device?: OAuthState['device']
  returnTo?: string
}): Promise<{ state: string; url: string }> {
  if (!vkEnabled()) throw new VkError('Вход через VK ID не настроен')
  const store = await getStore()
  const now = Date.now()
  await store.deleteExpiredOAuthStates(new Date(now).toISOString())

  const codeVerifier = randomBytes(48).toString('base64url')
  const state: OAuthState = {
    state: randomBytes(24).toString('base64url'),
    action: params.action,
    codeVerifier,
    userId: params.userId ?? null,
    device: params.device ?? null,
    returnTo: params.returnTo && params.returnTo.startsWith('/') && !params.returnTo.startsWith('//') ? params.returnTo : '/kabinet',
    error: '',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + STATE_TTL_MS).toISOString(),
  }
  await store.saveOAuthState(state)

  const url = new URL(`${base()}/authorize`)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.vk.clientId,
    redirect_uri: vkRedirectUri(),
    state: state.state,
    code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'email',
  }).toString()
  return { state: state.state, url: url.toString() }
}

export interface VkProfile {
  subject: string
  name: string
  email: string
}

async function postForm(url: string, form: Record<string, string>): Promise<Record<string, any>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await response.json().catch(() => null)) as Record<string, any> | null
  if (!json) throw new VkError(`VK ID ответил ${response.status}`)
  if (json.error) throw new VkError(String(json.error_description ?? json.error))
  return json
}

/** Обмен кода на профиль VK. */
export async function exchangeVk(state: OAuthState, code: string, deviceId: string): Promise<VkProfile> {
  const token = await postForm(`${base()}/oauth2/auth`, {
    grant_type: 'authorization_code',
    code,
    code_verifier: state.codeVerifier,
    client_id: config.vk.clientId,
    device_id: deviceId,
    redirect_uri: vkRedirectUri(),
    state: state.state,
  })
  if (!token.access_token) throw new VkError('VK ID не выдал токен')
  const info = await postForm(`${base()}/oauth2/user_info`, {
    client_id: config.vk.clientId,
    access_token: String(token.access_token),
  })
  const user = (info.user ?? {}) as Record<string, unknown>
  const subject = String(user.user_id ?? token.user_id ?? '')
  if (!subject) throw new VkError('VK ID не вернул профиль')
  const name = [user.first_name, user.last_name].filter((part) => typeof part === 'string' && part).join(' ')
  return { subject, name, email: typeof user.email === 'string' ? normalizeEmail(user.email) : '' }
}

export class VkLoginError extends Error {}

/**
 * Аккаунт для входа через VK: привязанный к этому профилю или новый.
 * Существующий аккаунт с той же почтой привязываем сам, только если почта в
 * нём подтверждена: иначе профиль VK с чужой почтой открыл бы аккаунт,
 * заведённый на неё без проверки. Неподтверждённый — владелец входит паролем
 * и привязывает VK в профиле.
 */
export async function accountForVk(profile: VkProfile): Promise<User> {
  const store = await getStore()
  const identity = await store.findOAuthIdentity(VK_PROVIDER, profile.subject)
  if (identity) {
    const user = await store.findUserById(identity.userId)
    if (!user || user.status === 'deleted') throw new VkLoginError('Аккаунт не найден')
    if (user.status === 'blocked') throw new VkLoginError('Аккаунт заблокирован. Напишите в поддержку, если это ошибка.')
    return user
  }

  if (!profile.email) {
    throw new VkLoginError(
      'В профиле VK ID нет почты. Зарегистрируйтесь по почте, а затем привяжите VK ID в профиле кабинета.',
    )
  }
  const existing = await store.findUserByEmail(profile.email)
  if (existing) {
    // Почта аккаунта подтверждена, VK отдаёт только подтверждённую почту —
    // это один и тот же человек: привязываем и входим.
    if (existing.emailVerifiedAt && existing.status === 'active') {
      await store.saveOAuthIdentity({
        provider: VK_PROVIDER,
        subject: profile.subject,
        userId: existing.id,
        name: profile.name,
        createdAt: new Date().toISOString(),
      })
      return existing
    }
    throw new VkLoginError(
      `Аккаунт с почтой ${profile.email} уже есть, но почта в нём не подтверждена. Войдите паролем и привяжите VK ID в профиле кабинета.`,
    )
  }
  if (!(await getRuntimeSettings()).registrationEnabled) throw new VkLoginError('Регистрация новых аккаунтов закрыта')

  const now = new Date().toISOString()
  const user: User = {
    id: newId('usr'),
    email: profile.email,
    name: profile.name || profile.email.split('@')[0],
    // Пароля нет: вход через VK ID, задать пароль можно через «Забыли пароль».
    passwordHash: '',
    role: 'user',
    status: 'active',
    createdAt: now,
    // VK ID отдаёт только подтверждённую почту.
    emailVerifiedAt: now,
  }
  await store.createUser(user)
  await store.saveOAuthIdentity({ provider: VK_PROVIDER, subject: profile.subject, userId: user.id, name: profile.name, createdAt: now })
  return user
}

/** Привязка профиля VK к вошедшему аккаунту. */
export async function linkVk(userId: string, profile: VkProfile): Promise<void> {
  const store = await getStore()
  const existing = await store.findOAuthIdentity(VK_PROVIDER, profile.subject)
  if (existing && existing.userId !== userId) throw new VkLoginError('Этот профиль VK ID уже привязан к другому аккаунту')
  const user = await store.findUserById(userId)
  if (!user || user.status !== 'active') throw new VkLoginError('Аккаунт не найден')
  await store.saveOAuthIdentity({
    provider: VK_PROVIDER,
    subject: profile.subject,
    userId,
    name: profile.name,
    createdAt: new Date().toISOString(),
  })
}
