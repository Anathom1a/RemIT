import { readJson } from '@/lib/client-api'
import { touchDevice } from '@/lib/quota'
import { clientIp } from '@/lib/rate-limit'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

const text = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
const field = (value: unknown, max = 200) => (typeof value === 'string' ? value.slice(0, max) : undefined)

/**
 * Сведения о системе: имя компьютера, пользователь ОС, процессор, память,
 * версия клиента. Клиент ждёт в ответ строку SYSINFO_UPDATED.
 */
export async function POST(request: Request) {
  const payload = await readJson<Record<string, unknown>>(request)
  const id = field(payload?.id, 64)?.trim()
  if (!payload || !id) return text('ID_NOT_FOUND')

  const store = await getStore()
  const ip = clientIp(request)
  await touchDevice(store, id, {
    uuid: field(payload.uuid),
    name: field(payload.hostname, 100),
    osUsername: field(payload.username, 100),
    os: field(payload.os, 200),
    cpu: field(payload.cpu, 200),
    memory: field(payload.memory, 50),
    version: field(payload.version, 30),
    ...(ip !== 'unknown' ? { lastIp: ip } : {}),
    sysinfoAt: new Date().toISOString(),
  })
  return text('SYSINFO_UPDATED')
}
