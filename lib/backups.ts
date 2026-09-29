import { getStore } from './store'

/**
 * Итоги резервного копирования. Контейнер backup (server/backup/backup.sh)
 * сообщает о каждой копии, мониторинг проверяет, что свежая проверенная
 * копия есть и ушла во внешнее хранилище.
 */

export interface BackupState {
  /** Последняя попытка. */
  at: string
  ok: boolean
  file: string
  size: number
  /** Копия ушла во внешнее хранилище. */
  remote: boolean
  error: string
  /** Последняя успешная (проверенная восстановлением) копия. */
  lastOkAt: string | null
  lastOkFile: string
  lastOkRemote: boolean
}

const KEY = 'backup_state'

export async function readBackupState(): Promise<BackupState | null> {
  const store = await getStore()
  const raw = (await store.getSettings())[KEY]
  if (!raw) return null
  try {
    return JSON.parse(raw) as BackupState
  } catch {
    return null
  }
}

export async function recordBackup(input: { ok: boolean; file: string; size: number; remote: boolean; error: string }, now = new Date()) {
  const previous = await readBackupState()
  const state: BackupState = {
    at: now.toISOString(),
    ok: input.ok,
    file: input.file.slice(0, 200),
    size: Math.max(0, Math.round(input.size)),
    remote: input.remote,
    error: input.error.slice(0, 500),
    lastOkAt: input.ok ? now.toISOString() : (previous?.lastOkAt ?? null),
    lastOkFile: input.ok ? input.file.slice(0, 200) : (previous?.lastOkFile ?? ''),
    lastOkRemote: input.ok ? input.remote : (previous?.lastOkRemote ?? false),
  }
  const store = await getStore()
  await store.setSetting(KEY, JSON.stringify(state))
  return state
}
