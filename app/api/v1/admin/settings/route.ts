import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { SETTING_KEYS, getRuntimeSettings, setRuntimeSetting, type SettingKey } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/** Текущие настройки сервиса. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  return NextResponse.json({ settings: await getRuntimeSettings() })
}

/**
 * Изменение настройки. Применяется без перезапуска: лимит бесплатного тарифа,
 * приём регистраций и сообщение для пользователей.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const key = String(payload.key ?? '') as SettingKey
  if (!(key in SETTING_KEYS)) {
    return NextResponse.json({ error: 'Неизвестная настройка' }, { status: 400 })
  }

  let value = String(payload.value ?? '')

  if (key === 'freeSecondsPerDay') {
    const seconds = Number.parseInt(value, 10)
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 24 * 60 * 60) {
      return NextResponse.json({ error: 'Лимит должен быть от 0 до 86400 секунд' }, { status: 400 })
    }
    value = String(seconds)
  }

  if (key === 'registrationEnabled') {
    value = value === 'true' ? 'true' : 'false'
  }

  if (key === 'maintenanceMessage' && value.length > 500) {
    return NextResponse.json({ error: 'Сообщение длиннее 500 символов' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, settings: await setRuntimeSetting(key, value) })
}
