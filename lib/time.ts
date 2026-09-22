import { config } from './config'

/**
 * Возвращает календарную дату (YYYY-MM-DD) в часовом поясе тарификации.
 * Именно по этой границе обнуляется бесплатный лимит 3 часа в сутки.
 */
export function billingDay(date: Date = new Date(), timeZone: string = config.quota.timeZone): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

/** Момент следующего обнуления лимита (00:00 в часовом поясе тарификации). */
export function nextResetAt(date: Date = new Date(), timeZone: string = config.quota.timeZone): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const get = (type: string) => Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
  const hours = get('hour') % 24
  const minutes = get('minute')
  const seconds = get('second')
  const secondsSinceMidnight = hours * 3600 + minutes * 60 + seconds
  const secondsLeft = 24 * 3600 - secondsSinceMidnight
  return new Date(date.getTime() + secondsLeft * 1000)
}

/** «2 ч 15 мин» — человекочитаемая длительность для кабинета и писем. */
export function humanDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0 && minutes > 0) return `${hours} ч ${minutes} мин`
  if (hours > 0) return `${hours} ч`
  if (minutes > 0) return `${minutes} мин`
  return `${total} сек`
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: config.quota.timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: config.quota.timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
