/** Названия тревог клиента RustDesk (AlarmAuditType в src/server/connection.rs). */
export const ALARM_NAMES: Record<number, string> = {
  0: 'подключение с адреса вне белого списка',
  1: 'больше 30 неверных паролей',
  2: '6 неверных паролей за минуту',
  6: 'много попыток из одной подсети IPv6',
  7: 'вход в терминал ОС: пауза после ошибок',
  8: 'вход в терминал ОС: слишком много одновременно',
  9: 'попытка выйти за рамки разрешённой сессии',
}

export function alarmName(type: number): string {
  return ALARM_NAMES[type] ?? `тревога №${type}`
}

/** Из JSON-строки подробностей — адрес и имя, если они там есть. */
export function alarmDetails(info: string): { ip: string; name: string; id: string } {
  try {
    const parsed = JSON.parse(info) as Record<string, unknown>
    return {
      ip: typeof parsed.ip === 'string' ? parsed.ip : '',
      name: typeof parsed.name === 'string' ? parsed.name : '',
      id: typeof parsed.id === 'string' ? parsed.id : '',
    }
  } catch {
    return { ip: '', name: '', id: '' }
  }
}
