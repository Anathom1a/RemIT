import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Команды' }
export const dynamic = 'force-dynamic'

const ROLE = { owner: 'владелец', admin: 'администратор', member: 'участник', invited: 'приглашён' } as const

export default async function AdminTeamsPage() {
  const store = await getStore()
  const teams = await store.listTeams(200)
  const rows = await Promise.all(
    teams.map(async (team) => {
      const [members, groups] = await Promise.all([store.listTeamMembers(team.id), store.listDeviceGroups(team.id)])
      const people = await Promise.all(
        members.map(async (member) => ({ member, email: (await store.findUserById(member.userId))?.email ?? '—' })),
      )
      return { team, people, groups }
    }),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Команды</h1>
        <p className="mt-1 text-sm text-text-muted">
          Участники команды видят устройства друг друга в клиенте. Команды создают и ведут сами пользователи в
          кабинете; здесь их можно распустить или исключить участника.
        </p>
      </div>

      {rows.length === 0 && <p className="card px-6 py-8 text-center text-sm text-text-muted">Команд пока нет.</p>}

      {rows.map(({ team, people, groups }) => (
        <div key={team.id} className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{team.name}</h2>
              <p className="mt-1 text-xs text-text-muted">
                создана {formatDateTime(team.createdAt)} · групп устройств: {groups.length}
                {groups.length > 0 && ` (${groups.map((group) => group.name).join(', ')})`}
              </p>
            </div>
            <ActionButton
              endpoint="/api/v1/admin/teams"
              body={{ action: 'disband', teamId: team.id }}
              label="Распустить"
              variant="danger"
              confirm={`Распустить команду «${team.name}»?`}
            />
          </div>
          <ul className="mt-4 divide-y divide-white/8">
            {people.map(({ member, email }) => (
              <li key={member.userId} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{email}</span>
                <span className="text-xs text-text-muted">
                  {ROLE[member.role]}
                  {member.seat && member.role !== 'owner' ? ' · место' : ''}
                </span>
                {member.role !== 'owner' && (
                  <ActionButton
                    endpoint="/api/v1/admin/teams"
                    body={{ action: 'remove', teamId: team.id, userId: member.userId }}
                    label="Исключить"
                    variant="danger"
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
