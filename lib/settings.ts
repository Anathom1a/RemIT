import { config } from './config'
import { getStore } from './store'

/**
 * Настройки, которые администратор меняет из админки без перезапуска.
 * Значение по умолчанию берётся из переменных окружения: пока в базе нет
 * записи, работает то, что задано при развёртывании.
 */
export interface RuntimeSettings {
  /** Бесплатный лимит в секундах на сутки. */
  freeSecondsPerDay: number
  /** Разрешена ли самостоятельная регистрация на сайте. */
  registrationEnabled: boolean
  /** Сообщение, которое видят пользователи в кабинете (работы, авария, акция). */
  maintenanceMessage: string
}

export const SETTING_KEYS = {
  freeSecondsPerDay: 'free_seconds_per_day',
  registrationEnabled: 'registration_enabled',
  maintenanceMessage: 'maintenance_message',
} as const

export type SettingKey = keyof typeof SETTING_KEYS

const CACHE_TTL_MS = 10_000
let cache: { value: RuntimeSettings; expiresAt: number } | null = null

function parse(raw: Record<string, string>): RuntimeSettings {
  const seconds = Number.parseInt(raw[SETTING_KEYS.freeSecondsPerDay] ?? '', 10)
  return {
    freeSecondsPerDay:
      Number.isFinite(seconds) && seconds >= 0 ? seconds : config.quota.freeSecondsPerDay,
    registrationEnabled: (raw[SETTING_KEYS.registrationEnabled] ?? 'true') !== 'false',
    maintenanceMessage: raw[SETTING_KEYS.maintenanceMessage] ?? '',
  }
}

/**
 * Читает настройки с коротким кэшем: heartbeat приходит часто, и каждый
 * запрос в базу за одним и тем же значением здесь ни к чему.
 */
export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  const store = await getStore()
  const value = parse(await store.getSettings())
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function setRuntimeSetting(key: SettingKey, value: string): Promise<RuntimeSettings> {
  const store = await getStore()
  await store.setSetting(SETTING_KEYS[key], value)
  cache = null
  return getRuntimeSettings()
}
