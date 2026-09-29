import { newId } from './auth'
import { teamSeats, type SeatInfo } from './seats'
import { getStore } from './store'
import type { Device, DeviceGroup, Team, TeamMember, User } from './types'

/**
 * Команды. Участники видят устройства друг друга во вкладке «Доступные
 * устройства» клиента, а владелец раскладывает их по группам устройств.
 *
 * Показать свои устройства другим — решение самого человека, поэтому в
 * команду не добавляют, а приглашают: пока приглашение не принято, никто
 * ничьих устройств не видит. Один аккаунт — одна команда.
 *
 * Роли: владелец платит за тариф и распоряжается командой целиком;
 * администратор приглашает и исключает участников, раздаёт места и ведёт
 * группы устройств; участник пользуется. Места — см. lib/seats.ts.
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
  seats: SeatInfo
}

/** Владелец или администратор. */
export const canManage = (member: TeamMember) => member.role === 'owner' || member.role === 'admin'

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
  return { team: found.team, me: found.member, members: withUsers, groups, seats: await teamSeats(store, found.team, members) }
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

async function requireManager(user: User): Promise<TeamView> {
  const view = await teamOf(user)
  if (!view || !canManage(view.me)) throw new TeamError('Это может только владелец или администратор команды', 403)
  return view
}

function memberOf(view: TeamView, userId: string): TeamMember {
  const found = view.members.find(({ member }) => member.userId === userId)
  if (!found) throw new TeamError('Участник не найден', 404)
  return found.member
}

export async function createTeam(user: User, name: unknown): Promise<Team> {
  const store = await getStore()
  if (await store.findTeamOfUser(user.id)) throw new TeamError('Вы уже в команде или у вас есть приглашение')
  const now = new Date().toISOString()
  const team: Team = { id: newId('team'), name: teamName(name), ownerId: user.id, createdAt: now }
  await store.createTeam(team, { teamId: team.id, userId: user.id, role: 'owner', seat: true, createdAt: now })
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
  const view = await requireManager(user)
  const store = await getStore()
  const target = await store.findUserByEmail(String(email ?? '').trim().toLowerCase())
  if (!target || target.status !== 'active') throw new TeamError('Аккаунт с такой почтой не найден', 404)
  if (view.members.length >= MAX_TEAM_MEMBERS) throw new TeamError('В команде слишком много участников')
  const added = await store.addTeamMember({
    teamId: view.team.id,
    userId: target.id,
    role: 'invited',
    seat: false,
    createdAt: new Date().toISOString(),
  })
  if (!added) throw new TeamError('Этот человек уже в команде или приглашён в другую')
}

/** Владелец или администратор убирает участника или отзывает приглашение. */
export async function removeMember(user: User, userId: string): Promise<void> {
  const view = await requireManager(user)
  const target = memberOf(view, userId)
  if (target.role === 'owner') throw new TeamError('Владельца исключить нельзя — только распустить команду')
  if (target.role === 'admin' && view.me.role !== 'owner') throw new TeamError('Администратора исключает владелец', 403)
  const store = await getStore()
  await clearGroupsOf(view, userId)
  await store.removeTeamMember(view.team.id, userId)
}

export async function acceptInvite(user: User): Promise<void> {
  const store = await getStore()
  const found = await store.findTeamOfUser(user.id)
  if (!found || found.member.role !== 'invited') throw new TeamError('Приглашения нет', 404)
  // Свободное место достаётся принявшему сразу: владелец для того и звал.
  const seats = await teamSeats(store, found.team)
  await store.removeTeamMember(found.team.id, user.id)
  await store.addTeamMember({
    ...found.member,
    role: 'member',
    seat: seats.total > 0 && seats.used < seats.total,
    createdAt: new Date().toISOString(),
  })
}

/** Выдать или забрать место. */
export async function setSeat(user: User, userId: string, seat: boolean): Promise<void> {
  const view = await requireManager(user)
  const target = memberOf(view, userId)
  if (target.role === 'owner') throw new TeamError('Место владельца не снимается')
  if (target.role === 'invited') throw new TeamError('Место выдаётся после того, как приглашение принято')
  if (seat && !target.seat) {
    if (view.seats.total === 0) {
      throw new TeamError('У владельца нет оплаченного тарифа — мест в команде нет', 409)
    }
    if (view.seats.used >= view.seats.total) {
      throw new TeamError(
        `Все места заняты: ${view.seats.used} из ${view.seats.total}. Заберите место у другого участника или перейдите на старший тариф.`,
        409,
      )
    }
  }
  const store = await getStore()
  await store.updateTeamMember({ ...target, seat })
}

/** Владелец назначает и снимает администраторов. */
export async function setRole(user: User, userId: string, role: unknown): Promise<void> {
  const view = await requireOwner(user)
  const target = memberOf(view, userId)
  if (role !== 'admin' && role !== 'member') throw new TeamError('Неизвестная роль')
  if (target.role !== 'admin' && target.role !== 'member') throw new TeamError('Роль меняется только у участников')
  const store = await getStore()
  await store.updateTeamMember({ ...target, role })
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
  const view = await requireManager(user)
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
  const view = await requireManager(user)
  const group = await requireGroup(view, groupId)
  const store = await getStore()
  await store.saveDeviceGroup({ ...group, name: teamName(name) })
}

export async function deleteGroup(user: User, groupId: string): Promise<void> {
  const view = await requireManager(user)
  await requireGroup(view, groupId)
  const store = await getStore()
  await store.deleteDeviceGroup(groupId)
}

/** Кладёт устройство участника в группу; пустой groupId — убирает из группы. */
export async function assignDevice(user: User, rustdeskId: string, groupId: string): Promise<void> {
  const view = await requireManager(user)
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
