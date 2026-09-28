import { NextResponse } from 'next/server'
import { denyIfNotAdmin } from '@/lib/admin'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Команды из админки: {action: "disband", teamId} или {action: "remove", teamId, userId}. */
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const store = await getStore()
  const team = await store.findTeam(String(body.teamId ?? ''))
  if (!team) return NextResponse.json({ error: 'Команда не найдена' }, { status: 404 })

  if (body.action === 'disband') {
    await store.deleteTeam(team.id)
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'remove') {
    const userId = String(body.userId ?? '')
    if (userId === team.ownerId) return NextResponse.json({ error: 'Владельца не исключить — распустите команду' }, { status: 400 })
    const groups = new Set((await store.listDeviceGroups(team.id)).map((group) => group.id))
    for (const device of await store.listDevicesByUser(userId)) {
      if (device.groupId && groups.has(device.groupId)) await store.setDeviceGroup(device.rustdeskId, null)
    }
    await store.removeTeamMember(team.id, userId)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
}
