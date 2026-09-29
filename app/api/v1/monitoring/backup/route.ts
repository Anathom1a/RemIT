import { NextResponse } from 'next/server'
import { isServiceRequest } from '@/lib/auth'
import { recordBackup } from '@/lib/backups'

export const dynamic = 'force-dynamic'

/** Итог резервной копии от контейнера backup: {ok, file, size, remote, error}. */
export async function POST(request: Request) {
  if (!isServiceRequest(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const state = await recordBackup({
    ok: body.ok === true,
    file: String(body.file ?? ''),
    size: Number(body.size ?? 0) || 0,
    remote: body.remote === true,
    error: String(body.error ?? ''),
  })
  console.info(`[backup] ${state.ok ? 'копия' : 'сбой'}: ${state.file || state.error}`)
  return NextResponse.json({ ok: true })
}
