import { NextResponse } from 'next/server'
import { readJson } from '@/lib/client-api'
import { clientIp, consumeLimit } from '@/lib/rate-limit'
import { ShareError, redeemShare } from '@/lib/webclient'

export const dynamic = 'force-dynamic'

/** Гостевая ссылка веб-клиента: отдаёт устройство и пароль, если ссылка жива. */
export async function POST(request: Request) {
  if (!consumeLimit(`shared-peer:${clientIp(request)}`, 30, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ code: 101, message: 'Слишком много попыток', data: null })
  }
  const body = await readJson<{ share_token?: unknown }>(request)
  try {
    const data = await redeemShare(String(body?.share_token ?? ''))
    return NextResponse.json({ code: 0, message: 'success', data })
  } catch (error) {
    if (error instanceof ShareError) return NextResponse.json({ code: 101, message: error.message, data: null })
    throw error
  }
}
