import { getStore } from './store'

/**
 * Политика клиентов: набор настроек, который сервер рассылает всем клиентам.
 *
 * Клиент RustDesk отправляет в heartbeat своё значение `modified_at`, а в
 * ответе понимает поле `strategy.config_options` и применяет его к своей
 * конфигурации. Благодаря этому правки — новый адрес сервера, запрет записи
 * экрана, включение проверки обновлений — доезжают до всех клиентов за один
 * интервал heartbeat, без переустановки.
 */

export interface ClientPolicy {
  options: Record<string, string>
  /** Версия политики: клиент сравнивает её со своей и забирает новую. */
  modifiedAt: number
}

const OPTIONS_KEY = 'client_policy'
const MODIFIED_KEY = 'client_policy_modified_at'

const CACHE_TTL_MS = 10_000
let cache: { value: ClientPolicy; expiresAt: number } | null = null

export async function getClientPolicy(): Promise<ClientPolicy> {
  if (cache && cache.expiresAt > Date.now()) return cache.value

  const store = await getStore()
  const settings = await store.getSettings()

  let options: Record<string, string> = {}
  try {
    const raw = settings[OPTIONS_KEY]
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      options = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]))
    }
  } catch {
    // Повреждённая политика не должна ломать heartbeat: рассылаем пустую.
    options = {}
  }

  const modifiedAt = Number.parseInt(settings[MODIFIED_KEY] ?? '0', 10) || 0
  const value: ClientPolicy = { options, modifiedAt }
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function setClientPolicy(options: Record<string, string>): Promise<ClientPolicy> {
  const store = await getStore()
  const clean = Object.fromEntries(
    Object.entries(options)
      .map(([key, value]) => [key.trim(), String(value ?? '').trim()])
      .filter(([key]) => key.length > 0),
  )
  const modifiedAt = Date.now()

  await store.setSetting(OPTIONS_KEY, JSON.stringify(clean))
  await store.setSetting(MODIFIED_KEY, String(modifiedAt))
  cache = null

  return { options: clean, modifiedAt }
}

/**
 * Часто используемые настройки клиента — подсказки для админки.
 * Полный список ключей есть в документации RustDesk.
 */
export const POLICY_HINTS: { key: string; title: string; example: string }[] = [
  { key: 'custom-rendezvous-server', title: 'ID-сервер', example: 'remit.su' },
  { key: 'relay-server', title: 'Сервер-ретранслятор', example: 'remit.su' },
  { key: 'api-server', title: 'API-сервер', example: 'https://remit.su' },
  { key: 'key', title: 'Открытый ключ сервера', example: 'base64…' },
  { key: 'enable-check-update', title: 'Проверять обновления при запуске', example: 'Y' },
  { key: 'allow-auto-update', title: 'Обновляться автоматически, без вопроса', example: 'Y' },
  { key: 'verification-method', title: 'Способ подтверждения', example: 'use-both-passwords' },
  { key: 'approve-mode', title: 'Режим подтверждения доступа', example: 'password-click' },
  { key: 'enable-file-transfer', title: 'Передача файлов', example: 'Y' },
  { key: 'allow-remote-config-modification', title: 'Менять настройки на стороне клиента', example: 'N' },
]
