import { config } from './config'

/**
 * Проксирование запросов клиента в панель lejianwen/rustdesk-api.
 * Шлюз стоит перед панелью только на /api/heartbeat, /api/audit/conn и
 * /api/login: остальные маршруты nginx отдаёт панели напрямую.
 */
export async function proxyToRustdeskApi(
  path: string,
  request: Request,
  body: string,
): Promise<{ status: number; json: Record<string, unknown> | null; text: string }> {
  const url = `${config.rustdesk.upstream.replace(/\/$/, '')}${path}`
  const headers = new Headers()
  headers.set('content-type', request.headers.get('content-type') ?? 'application/json')
  // accept-language — панель переводит по нему ошибки, referer — отличает
  // веб-клиент от приложения при входе.
  const forwarded = ['authorization', 'user-agent', 'x-real-ip', 'x-forwarded-for', 'accept-language', 'referer']
  for (const name of forwarded) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      // Панель отвечает быстро; зависший апстрим не должен задерживать учёт времени.
      signal: AbortSignal.timeout(8000),
    })
    const text = await response.text()
    let json: Record<string, unknown> | null = null
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      json = null
    }
    return { status: response.status, json, text }
  } catch {
    // Панель недоступна: учёт квоты всё равно должен отработать.
    return { status: 502, json: null, text: '' }
  }
}
