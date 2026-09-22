import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Устройства, которые видел сервер, с их владельцами. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const url = new URL(request.url)
  const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100))

  const store = await getStore()
  const devices = await store.listDevices(limit)
  const rows = await Promise.all(
    devices.map(async (device) => ({
      ...device,
      email: device.userId ? ((await store.findUserById(device.userId))?.email ?? null) : null,
    })),
  )
  return NextResponse.json({ devices: rows })
}

/** Привязка устройства к аккаунту и отвязка — поддержка делает это за клиента. */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const rustdeskId = String(payload.rustdeskId ?? '').trim()
  const action = String(payload.action ?? 'unbind')
  if (!rustdeskId) return NextResponse.json({ error: 'Нужен ID устройства' }, { status: 400 })

  const store = await getStore()
  const device = await store.findDeviceByRustdeskId(rustdeskId)
  if (!device) return NextResponse.json({ error: 'Устройство не найдено' }, { status: 404 })

  if (action === 'bind') {
    const userId = String(payload.userId ?? '')
    const user = await store.findUserById(userId)
    if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    await store.setDeviceOwner(rustdeskId, userId)
    return NextResponse.json({ ok: true, action: 'bind' })
  }

  await store.setDeviceOwner(rustdeskId, null)
  return NextResponse.json({ ok: true, action: 'unbind' })
}
