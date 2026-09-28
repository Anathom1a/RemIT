import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { ServerCmdError, sendServerCommand } from '@/lib/server-cmd'

export const dynamic = 'force-dynamic'

/** Служебная команда hbbs или hbbr: {target: "hbbs"|"hbbr", command: "rs"}. */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const target = body.target === 'hbbr' ? 'hbbr' : 'hbbs'
  const command = String(body.command ?? '').slice(0, 500)
  try {
    const output = await sendServerCommand(target, command)
    console.info(`[server-cmd] ${target}: ${command}`)
    return NextResponse.json({ ok: true, output })
  } catch (error) {
    if (error instanceof ServerCmdError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}
