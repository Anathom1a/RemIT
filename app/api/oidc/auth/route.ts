import { NextResponse } from 'next/server'
import { readJson } from '@/lib/client-api'
import { clientIp, consumeLimit } from '@/lib/rate-limit'
import { VK_CLIENT_OP, VkError, beginVk } from '@/lib/vk'

export const dynamic = 'force-dynamic'

/**
 * Кнопка «VK ID» в клиенте: {op, id, uuid, deviceInfo}. Отвечаем адресом,
 * который клиент откроет в браузере, и кодом для опроса /api/oidc/auth-query.
 */
export async function POST(request: Request) {
  if (!consumeLimit(`oidc-auth:${clientIp(request)}`, 30, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 })
  }
  const body = (await readJson<Record<string, any>>(request)) ?? {}
  if (String(body.op ?? '').toLowerCase() !== VK_CLIENT_OP.toLowerCase()) {
    return NextResponse.json({ error: 'Неизвестный способ входа' }, { status: 400 })
  }
  const info = (body.deviceInfo ?? {}) as Record<string, unknown>
  try {
    const { state, url } = await beginVk({
      action: 'client',
      device: {
        id: String(body.id ?? '').slice(0, 64),
        uuid: String(body.uuid ?? '').slice(0, 200),
        name: typeof info.name === 'string' ? info.name.slice(0, 100) : '',
        os: typeof info.os === 'string' ? info.os.slice(0, 100) : '',
        type: typeof info.type === 'string' ? info.type.slice(0, 20) : '',
      },
    })
    return NextResponse.json({ code: state, url })
  } catch (error) {
    return NextResponse.json({ error: error instanceof VkError ? error.message : 'Вход через VK ID недоступен' }, { status: 400 })
  }
}
