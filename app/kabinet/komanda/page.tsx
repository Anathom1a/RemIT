import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ActionButton } from '@/components/admin/action-button'
import { JsonForm, inputClass } from '@/components/cabinet/json-form'
import { getCurrentUser } from '@/lib/auth'
import { config } from '@/lib/config'
import { getStore } from '@/lib/store'
import { activeMembers, canManage, teamOf } from '@/lib/teams'
import { getPlan } from '@/lib/plans'
import type { Device } from '@/lib/types'

export const metadata: Metadata = { title: 'Команда' }
export const dynamic = 'force-dynamic'

const API = '/api/v1/team'

const ROLE: Record<string, string> = { owner: 'владелец', admin: 'администратор', member: 'участник' }

export default async function TeamPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const view = await teamOf(user)
  const store = await getStore()

  if (!view) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="card p-6">
          <h2 className="font-semibold">Создать команду</h2>
          <p className="mt-1.5 mb-4 text-sm text-text-secondary">
            Участники команды видят устройства друг друга во вкладке «Доступные устройства» клиента{' '}
            {config.brand.name} и подключаются к ним в один клик. Пригласите коллег по почте их аккаунтов.
          </p>
          <JsonForm endpoint={API} body={{ action: 'create' }} submitLabel="Создать" className="flex flex-wrap items-center gap-2">
            <input name="name" required maxLength={60} placeholder="Название, например «Отдел ИТ»" className={`${inputClass} w-72`} />
          </JsonForm>
        </div>
      </div>
    )
  }

  if (view.me.role === 'invited') {
    const owner = view.members.find(({ member }) => member.role === 'owner')?.user
    return (
      <div className="space-y-6">
        <Header />
        <div className="card p-6">
          <h2 className="font-semibold">Приглашение в команду «{view.team.name}»</h2>
          <p className="mt-1.5 text-sm text-text-secondary">
            Пригласил {owner?.email ?? 'владелец команды'}. Если примете, участники увидят ваши устройства в клиенте, а
            вы — их. Если в команде есть свободное место, вы сразу начнёте работать по тарифу команды.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton endpoint={API} body={{ action: 'accept' }} label="Принять" variant="primary" />
            <ActionButton endpoint={API} body={{ action: 'leave' }} label="Отклонить" variant="danger" />
          </div>
        </div>
      </div>
    )
  }

  const owner = view.me.role === 'owner'
  const manager = canManage(view.me)
  const members = activeMembers(view)
  const { seats } = view
  const seatPlan = seats.ownerSubscription ? getPlan(seats.ownerSubscription.plan) : null
  // У кого своя подписка — работает по ней, место ему не нужно.
  const ownPlan = new Map<string, string>()
  for (const { user: person, member } of members) {
    if (member.role === 'owner') continue
    const subscription = await store.getActiveSubscription(person.id)
    if (subscription) ownPlan.set(person.id, getPlan(subscription.plan).name)
  }
  const seatLabel = (userId: string, role: string) => {
    if (role === 'owner') return seats.total > 0 ? 'место владельца' : ''
    if (ownPlan.has(userId)) return `свой тариф «${ownPlan.get(userId)}»`
    if (seats.holders.includes(userId)) return 'место'
    if (seats.overflow.includes(userId)) return 'место сверх лимита — не действует'
    return 'без места — бесплатный тариф'
  }
  const invited = view.members.filter(({ member }) => member.role === 'invited')
  const devices: { device: Device; email: string }[] = []
  for (const { user: member } of members) {
    for (const device of await store.listDevicesByUser(member.id)) devices.push({ device, email: member.email })
  }
  const groupName = new Map(view.groups.map((group) => [group.id, group.name]))

  return (
    <div className="space-y-6">
      <Header />

      <div className="card p-6">
        <h2 className="font-semibold">{view.team.name}</h2>
        <p className="mt-1 text-sm text-text-muted">
          {members.length} в команде · {devices.length} устройств видно в клиенте у каждого участника
        </p>
        <div className="mt-4 rounded-xl border border-white/8 bg-ink-850/50 p-4 text-sm leading-relaxed text-text-secondary">
          {seats.total > 0 && seatPlan ? (
            <>
              <span className="font-medium text-text-primary">
                Места: {seats.used} из {seats.total}
              </span>{' '}
              по тарифу «{seatPlan.name}» владельца. Участник с местом работает по этому тарифу под своим аккаунтом;{' '}
              {seats.total} одновременных сессий — общие на всю команду.
              {seats.overflow.length > 0 && (
                <span className="block text-warning">
                  Мест меньше, чем отмеченных участников: у {seats.overflow.length} место не действует. Заберите лишние
                  места или перейдите на старший тариф.
                </span>
              )}
            </>
          ) : (
            <>
              Мест пока нет: у владельца бесплатный тариф. Когда он оплатит «Профи» или «Бизнес», участники смогут
              работать по этому тарифу — мест столько же, сколько одновременных сессий.
              {owner && (
                <a href="/kabinet/podpiska" className="ml-1 text-brand-400 hover:text-brand-300">
                  Выбрать тариф
                </a>
              )}
            </>
          )}
        </div>
        <ul className="mt-4 divide-y divide-white/8">
          {members.map(({ member, user: person }) => (
            <li key={person.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-sm">
                {person.email}
                {person.name && <span className="ml-2 text-text-muted">{person.name}</span>}
              </span>
              <span className="text-xs text-text-muted">
                {ROLE[member.role]}
                {seatLabel(person.id, member.role) && ` · ${seatLabel(person.id, member.role)}`}
              </span>
              {manager && member.role !== 'owner' && !ownPlan.has(person.id) && seats.total > 0 && (
                <ActionButton
                  endpoint={API}
                  body={{ action: 'seat', userId: person.id, seat: !member.seat }}
                  label={member.seat ? 'Забрать место' : 'Дать место'}
                  variant={member.seat ? 'secondary' : 'primary'}
                />
              )}
              {owner && member.role !== 'owner' && (
                <ActionButton
                  endpoint={API}
                  body={{ action: 'role', userId: person.id, role: member.role === 'admin' ? 'member' : 'admin' }}
                  label={member.role === 'admin' ? 'Снять администратора' : 'Сделать администратором'}
                />
              )}
              {manager && member.role !== 'owner' && (owner || member.role !== 'admin') && person.id !== user.id && (
                <ActionButton
                  endpoint={API}
                  body={{ action: 'remove', userId: person.id }}
                  label="Исключить"
                  variant="danger"
                  confirm={`Исключить ${person.email} из команды?`}
                />
              )}
            </li>
          ))}
          {invited.map(({ user: person }) => (
            <li key={person.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{person.email}</span>
              <span className="text-xs text-text-muted">приглашён</span>
              {manager && (
                <ActionButton endpoint={API} body={{ action: 'remove', userId: person.id }} label="Отозвать" variant="danger" />
              )}
            </li>
          ))}
        </ul>
        {manager && (
          <JsonForm
            endpoint={API}
            body={{ action: 'invite' }}
            submitLabel="Пригласить"
            reset
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <input name="email" type="email" required placeholder="Почта аккаунта коллеги" className={`${inputClass} w-72`} />
          </JsonForm>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold">Группы устройств · {view.groups.length}</h2>
        <p className="mt-1.5 text-sm text-text-secondary">
          По группам клиент раскладывает «Доступные устройства»: например, «Бухгалтерия» и «Склад».
        </p>
        {view.groups.length > 0 && (
          <ul className="mt-4 space-y-3">
            {view.groups.map((group) => (
              <li key={group.id} className="flex flex-wrap items-center gap-2">
                {manager ? (
                  <>
                    <JsonForm
                      endpoint={API}
                      body={{ action: 'group-rename', groupId: group.id }}
                      submitLabel="Переименовать"
                      variant="secondary"
                      className="flex items-center gap-2"
                    >
                      <input name="name" required defaultValue={group.name} className={`${inputClass} w-56`} aria-label="Название группы" />
                    </JsonForm>
                    <ActionButton
                      endpoint={API}
                      body={{ action: 'group-delete', groupId: group.id }}
                      label="Удалить"
                      variant="danger"
                      confirm={`Удалить группу «${group.name}»? Устройства останутся, просто без группы.`}
                    />
                  </>
                ) : (
                  <span className="text-sm">{group.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {manager && (
          <JsonForm
            endpoint={API}
            body={{ action: 'group-create' }}
            submitLabel="Добавить группу"
            reset
            variant="secondary"
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <input name="name" required maxLength={60} placeholder="Название группы" className={`${inputClass} w-56`} />
          </JsonForm>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Устройства команды · {devices.length}</h2>
        </div>
        {devices.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-text-muted">
            Устройства появятся, когда участники войдут в клиенте или привяжут их в кабинете.
          </p>
        ) : (
          <ul className="divide-y divide-white/8">
            {devices.map(({ device, email }) => (
              <li key={device.rustdeskId} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-mono">{device.rustdeskId}</span>
                    {device.name && <span className="ml-2">{device.name}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {email}
                    {device.os ? ` · ${device.os}` : ''}
                  </p>
                </div>
                {manager && view.groups.length > 0 ? (
                  <JsonForm
                    endpoint={API}
                    body={{ action: 'assign', rustdeskId: device.rustdeskId }}
                    submitLabel="Сохранить"
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    <select name="groupId" defaultValue={device.groupId ?? ''} className={`${inputClass} w-48`} aria-label="Группа">
                      <option value="">без группы</option>
                      {view.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </JsonForm>
                ) : (
                  <span className="text-xs text-text-muted">{(device.groupId && groupName.get(device.groupId)) || 'без группы'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-6">
        {owner ? (
          <div className="space-y-4">
            <JsonForm
              endpoint={API}
              body={{ action: 'rename' }}
              submitLabel="Переименовать команду"
              variant="secondary"
              className="flex flex-wrap items-center gap-2"
            >
              <input name="name" required maxLength={60} defaultValue={view.team.name} className={`${inputClass} w-72`} />
            </JsonForm>
            <ActionButton
              endpoint={API}
              body={{ action: 'disband' }}
              label="Распустить команду"
              variant="danger"
              confirm="Распустить команду? Участники перестанут видеть устройства друг друга, группы удалятся."
            />
          </div>
        ) : (
          <ActionButton
            endpoint={API}
            body={{ action: 'leave' }}
            label="Выйти из команды"
            variant="danger"
            confirm="Выйти из команды? Участники перестанут видеть ваши устройства."
          />
        )}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Команда</h1>
      <p className="mt-1 text-sm text-text-muted">
        Общий список устройств для коллег во вкладке «Доступные устройства» клиента и общий тариф: места в команде.
      </p>
    </div>
  )
}
