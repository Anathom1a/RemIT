/**
 * Ограничение частоты попыток: вход, регистрация, запрос сброса пароля.
 *
 * Считаем в памяти процесса. Сайт работает одним процессом за nginx, поэтому
 * этого достаточно; при нескольких экземплярах лимит станет мягче (каждый
 * считает своё), но не исчезнет. После перезапуска счётчики обнуляются —
 * для защиты от перебора это не страшно: окно всё равно 15 минут.
 */

interface Window {
  /** Моменты попыток внутри окна, миллисекунды. */
  hits: number[]
}

const windows = new Map<string, Window>()
let lastSweep = 0

function sweep(now: number, maxWindowMs: number): void {
  // Раз в минуту выбрасываем ключи без свежих попыток, чтобы карта не росла.
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, window] of windows) {
    if (window.hits.length === 0 || now - window.hits[window.hits.length - 1] > maxWindowMs) windows.delete(key)
  }
}

export interface LimitCheck {
  allowed: boolean
  /** Через сколько секунд можно пробовать снова. */
  retryAfter: number
}

function prune(key: string, windowMs: number, now: number): Window {
  const window = windows.get(key) ?? { hits: [] }
  window.hits = window.hits.filter((at) => now - at < windowMs)
  windows.set(key, window)
  return window
}

/** Можно ли сделать ещё одну попытку. Саму попытку не засчитывает. */
export function checkLimit(key: string, limit: number, windowMs: number, now = Date.now()): LimitCheck {
  sweep(now, windowMs)
  const window = prune(key, windowMs, now)
  if (window.hits.length < limit) return { allowed: true, retryAfter: 0 }
  const retryAfter = Math.max(1, Math.ceil((window.hits[0] + windowMs - now) / 1000))
  return { allowed: false, retryAfter }
}

/** Засчитывает попытку. */
export function recordHit(key: string, windowMs: number, now = Date.now()): void {
  prune(key, windowMs, now).hits.push(now)
}

/** Проверяет и сразу засчитывает — для действий, где каждая попытка на счету. */
export function consumeLimit(key: string, limit: number, windowMs: number, now = Date.now()): LimitCheck {
  const check = checkLimit(key, limit, windowMs, now)
  if (check.allowed) recordHit(key, windowMs, now)
  return check
}

/** Ключ неудачных входов на почту — общий для входа и сброса пароля. */
export function loginEmailKey(email: string): string {
  return `login-email:${email}`
}

/** Сбрасывает счётчик — например, после успешного входа. */
export function clearLimit(key: string): void {
  windows.delete(key)
}

/**
 * Адрес клиента. Берём X-Real-IP: nginx записывает туда настоящий адрес
 * соединения, затирая всё, что прислал клиент. X-Forwarded-For не годится —
 * его начало клиент может подделать.
 */
export function clientIp(request: Request): string {
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Сообщение и заголовок Retry-After для ответа 429. */
export function tooManyAttempts(retryAfter: number): { body: { error: string }; headers: Record<string, string> } {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return {
    body: { error: `Слишком много попыток. Попробуйте снова через ${minutes} мин.` },
    headers: { 'Retry-After': String(retryAfter) },
  }
}
