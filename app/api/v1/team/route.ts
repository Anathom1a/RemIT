import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  TeamError,
  acceptInvite,
  assignDevice,
  createGroup,
  createTeam,
  deleteGroup,
  disbandTeam,
  inviteMember,
  leaveTeam,
  removeMember,
  renameGroup,
  renameTeam,
} from '@/lib/teams'

export const dynamic = 'force-dynamic'

/** Команда в кабинете: одна точка, действие — в поле action. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  try {
    switch (body.action) {
      case 'create':
        await createTeam(user, body.name)
        break
      case 'rename':
        await renameTeam(user, body.name)
        break
      case 'disband':
        await disbandTeam(user)
        break
      case 'invite':
        await inviteMember(user, body.email)
        break
      case 'remove':
        await removeMember(user, String(body.userId ?? ''))
        break
      case 'accept':
        await acceptInvite(user)
        break
      case 'leave':
        await leaveTeam(user)
        break
      case 'group-create':
        await createGroup(user, body.name)
        break
      case 'group-rename':
        await renameGroup(user, String(body.groupId ?? ''), body.name)
        break
      case 'group-delete':
        await deleteGroup(user, String(body.groupId ?? ''))
        break
      case 'assign':
        await assignDevice(user, String(body.rustdeskId ?? ''), String(body.groupId ?? ''))
        break
      default:
        return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}
