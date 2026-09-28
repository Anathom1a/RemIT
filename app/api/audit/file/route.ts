import { NextResponse } from 'next/server'
import { newId } from '@/lib/auth'
import { readJson } from '@/lib/client-api'
import { clientIp, consumeLimit } from '@/lib/rate-limit'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Журнал передачи файлов от управляемого клиента: кто, откуда, в какую
 * папку и какие файлы (до десяти самых крупных).
 */
export async function POST(request: Request) {
  // Журнал пишется без входа (так устроен клиент), поэтому ограничиваем
  // частоту с одного адреса, чтобы его нельзя было забить мусором.
  if (!consumeLimit(`audit-file:${clientIp(request)}`, 300, 60_000).allowed) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 })
  }
  const payload = await readJson<Record<string, any>>(request)
  const hostId = String(payload?.id ?? '').slice(0, 64)
  if (!payload || !hostId) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  let info: Record<string, any> = {}
  try {
    info = typeof payload.info === 'string' ? JSON.parse(payload.info) : (payload.info ?? {})
  } catch {
    info = {}
  }
  const files: [string, number][] = Array.isArray(info.files)
    ? info.files
        .filter((item: unknown) => Array.isArray(item))
        .slice(0, 10)
        .map((item: unknown[]) => [String(item[0] ?? '').slice(0, 300), Number(item[1]) || 0])
    : []

  const store = await getStore()
  await store.createFileAudit({
    id: newId('fa'),
    hostId,
    controllerId: String(payload.peer_id ?? '').slice(0, 64),
    controllerName: String(info.name ?? '').slice(0, 100),
    ip: String(info.ip ?? '').slice(0, 64),
    type: Number(payload.type) || 0,
    path: String(payload.path ?? '').slice(0, 1000),
    isFile: Boolean(payload.is_file),
    num: Number(info.num) || files.length,
    files,
    createdAt: new Date().toISOString(),
  })
  return NextResponse.json({ code: 0, message: 'success', data: '' })
}
