import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import {
  RelayError,
  addRelay,
  applyRelays,
  reconcileRelays,
  relayCommand,
  relayInstallCommand,
  relayStatuses,
  removeRelay,
  updateRelay,
} from '@/lib/relays'
import { ServerCmdError } from '@/lib/server-cmd'

export const dynamic = 'force-dynamic'

/** Список ретрансляторов с проверкой доступности. */
export async function GET(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied
  return NextResponse.json({ relays: await relayStatuses() })
}

/**
 * Действия: add {address, name, region, coords}, update {id, enabled?, name?, region?, coords?},
 * remove {id}, apply, sync, install {id}, command {id, command}.
 * После изменений список сразу уходит в hbbs.
 */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(body.id ?? '')
  try {
    switch (body.action) {
      case 'add': {
        const relay = await addRelay({ address: body.address, name: body.name, region: body.region, coords: body.coords })
        console.info(`[relays] добавлен ${relay.address}`)
        return NextResponse.json({ ok: true, relay, install: await relayInstallCommand(relay.id) })
      }
      case 'update': {
        const relay = await updateRelay(id, { enabled: body.enabled, name: body.name, region: body.region, coords: body.coords })
        console.info(`[relays] изменён ${relay.address}: ${relay.enabled ? 'включён' : 'выключен'}`)
        return NextResponse.json({ ok: true, relay, hbbs: await applyRelays() })
      }
      case 'remove':
        await removeRelay(id)
        console.info(`[relays] удалён ${id}`)
        return NextResponse.json({ ok: true, hbbs: await applyRelays() })
      case 'apply':
        return NextResponse.json({ ok: true, hbbs: await applyRelays() })
      case 'sync':
        return NextResponse.json({ ok: true, hbbs: await reconcileRelays({ force: true }) })
      case 'install':
        return NextResponse.json({ ok: true, install: await relayInstallCommand(id) })
      case 'command': {
        const command = String(body.command ?? '').slice(0, 500)
        const output = await relayCommand(id, command)
        console.info(`[relays] ${id}: ${command}`)
        return NextResponse.json({ ok: true, output })
      }
      default:
        return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }
  } catch (error) {
    if (error instanceof RelayError || error instanceof ServerCmdError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}
