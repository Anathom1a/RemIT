export const dynamic = 'force-dynamic'

/**
 * Версия формата сведений о системе на сервере. Клиент сверяет её с
 * сохранённой и, если совпало, не шлёт сведения повторно.
 */
export function POST() {
  return new Response('remit-1', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
