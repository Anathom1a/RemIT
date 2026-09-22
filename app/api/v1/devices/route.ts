import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Список устройств аккаунта. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const store = await getStore()
  return NextResponse.json({ devices: await store.listDevicesByUser(user.id) })
}

/**
 * Привязка устройства к аккаунту по его ID из клиента.
 * Устройство должно быть уже видно серверу — то есть клиент запущен и
 * прислал хотя бы один heartbeat.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  const rustdeskId = String(payload.rustdeskId ?? '').trim()
  if (!rustdeskId) return NextResponse.json({ error: 'Укажите ID устройства' }, { status: 400 })

  const store = await getStore()
  const device = await store.findDeviceByRustdeskId(rustdeskId)
  if (!device) {
    return NextResponse.json(
      { error: 'Устройство не найдено. Запустите клиент RemIT на этом компьютере и повторите.' },
      { status: 404 },
    )
  }
  if (device.userId && device.userId !== user.id) {
    return NextResponse.json({ error: 'Устройство уже привязано к другому аккаунту' }, { status: 409 })
  }

  await store.setDeviceOwner(rustdeskId, user.id)
  return NextResponse.json({ ok: true })
}

/** Отвязка устройства. */
export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const rustdeskId = url.searchParams.get('id') ?? ''
  const store = await getStore()
  const device = await store.findDeviceByRustdeskId(rustdeskId)
  if (!device || device.userId !== user.id) {
    return NextResponse.json({ error: 'Устройство не найдено' }, { status: 404 })
  }

  await store.setDeviceOwner(rustdeskId, null)
  return NextResponse.json({ ok: true })
}
