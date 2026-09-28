import { newId } from './auth'
import { getStore } from './store'
import type { Device, DeviceGroup, Team, TeamMember, User } from './types'

/**
 * Команды. Участники видят устройства друг друга во вкладке «Доступные
 * устройства» клиента, а владелец раскладывает их по группам устройств.
 *
 * Показать свои устройства другим — решение самого человека, поэтому в
 * команду не добавляют, а приглашают: пока приглашение не принято, никто
 * ничьих устройств не видит. Один аккаунт — одна команда.
 */

export class TeamError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

export const MAX_TEAM_MEMBERS = 200

export interface TeamView {
  team: Team
  me: TeamMember
  members: { member: TeamMember; user: User }[]
  groups: DeviceGroup[]
}

export async function teamOf(user: User): Promise<TeamView | null> {
  const store = await getStore()
  const found = await store.findTeamOfUser(user.id)
  if (!found) return null
  const [members, groups] = await Promise.all([store.listTeamMembers(found.team.id), store.listDeviceGroups(found.team.id)])
  const withUsers: TeamView['members'] = []
  for (const member of members) {
    const memberUser = await store.findUserById(member.userId)
    if (memberUser && memberUser.status !== 'deleted') withUsers.push({ member, user: memberUser })
  }
  return { team: found.team, me: found.member, members: withUsers, groups }
}

function teamName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().slice(0, 60) : ''
  if (!name) throw new TeamError('Укажите название')
  return name
}

async function requireOwner(user: User): Promise<TeamView> {
  const view = await teamOf(user)
  if (!view || view.me.role !== 'owner') throw new TeamError('Это может только владелец команды', 403)
  return view
}

export async function createTeam(user: User, name: unknown): Promise<Team> {
  const store = await getStore()
  if (await store.findTeamOfUser(user.id)) throw new TeamError('Вы уже в команде или у вас есть приглашение')
  const now = new Date().toISOString()
  const team: Team = { id: newId('team'), name: teamName(name), ownerId: user.id, createdAt: now }
  await store.createTeam(team, { teamId: team.id, userId: user.id, role: 'owner', createdAt: now })
  return team
}

export async function renameTeam(user: User, name: unknown): Promise<void> {
  const view = await requireOwner(user)
  const store = await getStore()
  await store.saveTeam({ ...view.team, name: teamName(name) })
}

export async function disbandTeam(user: User): Promise<void> {
  const view = await requireOwner(user)
  const store = await getStore()
  await store.deleteTeam(view.team.id)
}

export async function inviteMember(user: User, email: unknown): Promise<void> {
  const view = await requireOwner(user)
  const store = await getStore()
  const target = await store.findUserByEmail(String(email ?? '').trim().toLowerCase())
  if (!target || target.status !== 'active') throw new TeamError('Аккаунт с такой почтой не найден', 404)
  if (view.members.length >= MAX_TEAM_MEMBERS) throw new TeamError('В команде слишком много участников')
  const added = await store.addTeamMember({
    teamId: view.team.id,
    userId: target.id,
    role: 'invited',
    createdAt: new Date().toISOString(),
  })
  if (!added) throw new TeamError('Этот человек уже в команде или приглашён в другую')
}

/** Владелец убирает участника или отзывает приглашение. */
export async function removeMember(user: User, userId: string): Promise<void> {
  const view = await requireOwner(user)
  if (userId === user.id) throw new TeamError('Владелец не может исключить себя — распустите команду')
  const store = await getStore()
  await clearGroupsOf(view, userId)
  await store.removeTeamMember(view.team.id, userId)
}

export async function acceptInvite(user: User): Promise<void> {
  const store = await getStore()
  const found = await store.findTeamOfUser(user.id)
  if (!found || found.member.role !== 'invited') throw new TeamError('Приглашения нет', 404)
  await store.removeTeamMember(found.team.id, user.id)
  await store.addTeamMember({ ...found.member, role: 'member', createdAt: new Date().toISOString() })
}

/** Отклонить приглашение или выйти из команды. */
export async function leaveTeam(user: User): Promise<void> {
  const view = await teamOf(user)
  if (!view) throw new TeamError('Вы не в команде', 404)
  if (view.me.role === 'owner') throw new TeamError('Владелец не может выйти — распустите команду')
  const store = await getStore()
  await clearGroupsOf(view, user.id)
  await store.removeTeamMember(view.team.id, user.id)
}

/** Устройства ушедшего участника больше не лежат в группах команды. */
async function clearGroupsOf(view: TeamView, userId: string): Promise<void> {
  const store = await getStore()
  const groups = new Set(view.groups.map((group) => group.id))
  for (const device of await store.listDevicesByUser(userId)) {
    if (device.groupId && groups.has(device.groupId)) await store.setDeviceGroup(device.rustdeskId, null)
  }
}

// --- Группы устройств ----------------------------------------------------------

export async function createGroup(user: User, name: unknown): Promise<void> {
  const view = await requireOwner(user)
  if (view.groups.length >= 100) throw new TeamError('Слишком много групп')
  const store = await getStore()
  await store.saveDeviceGroup({
    id: newId('dg'),
    teamId: view.team.id,
    name: teamName(name),
    createdAt: new Date().toISOString(),
  })
}

async function requireGroup(view: TeamView, groupId: string): Promise<DeviceGroup> {
  const group = view.groups.find((item) => item.id === groupId)
  if (!group) throw new TeamError('Группа не найдена', 404)
  return group
}

export async function renameGroup(user: User, groupId: string, name: unknown): Promise<void> {
  const view = await requireOwner(user)
  const group = await requireGroup(view, groupId)
  const store = await getStore()
  await store.saveDeviceGroup({ ...group, name: teamName(name) })
}

export async function deleteGroup(user: User, groupId: string): Promise<void> {
  const view = await requireOwner(user)
  await requireGroup(view, groupId)
  const store = await getStore()
  await store.deleteDeviceGroup(groupId)
}

/** Кладёт устройство участника в группу; пустой groupId — убирает из группы. */
export async function assignDevice(user: User, rustdeskId: string, groupId: string): Promise<void> {
  const view = await requireOwner(user)
  const store = await getStore()
  const device = await store.findDeviceByRustdeskId(rustdeskId)
  const visible = new Set(activeMembers(view).map(({ user: member }) => member.id))
  if (!device || !device.userId || !visible.has(device.userId)) throw new TeamError('Устройство не найдено', 404)
  if (groupId) await requireGroup(view, groupId)
  await store.setDeviceGroup(rustdeskId, groupId || null)
}

export function activeMembers(view: TeamView) {
  return view.members.filter(({ member }) => member.role !== 'invited')
}

/**
 * Что видит пользователь во вкладке «Доступные устройства»: себя и, если
 * он участник команды, её участников с их устройствами.
 */
export async function accessibleForClient(user: User): Promise<{
  users: User[]
  devices: { device: Device; owner: User; groupName: string }[]
  groups: DeviceGroup[]
}> {
  const store = await getStore()
  const view = await teamOf(user)
  const members = view && view.me.role !== 'invited' ? activeMembers(view).map(({ user: member }) => member) : [user]
  const groups = view && view.me.role !== 'invited' ? view.groups : []
  const groupNames = new Map(groups.map((group) => [group.id, group.name]))
  const devices: { device: Device; owner: User; groupName: string }[] = []
  for (const member of members) {
    for (const device of await store.listDevicesByUser(member.id)) {
      devices.push({ device, owner: member, groupName: (device.groupId && groupNames.get(device.groupId)) || '' })
    }
  }
  return { users: members.filter((member) => member.status === 'active'), devices, groups }
}
