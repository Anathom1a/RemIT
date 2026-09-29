import { randomUUID } from 'node:crypto'
import { getStore } from './store'
import { COMPONENTS } from './monitoring'
import type { Incident, IncidentImpact, IncidentStatus } from './types'

/** Инциденты и плановые работы, которые ведёт администратор. */

export class IncidentError extends Error {
  status = 400
}

const OUTAGE_STATUSES: IncidentStatus[] = ['investigating', 'identified', 'monitoring', 'resolved']
const MAINTENANCE_STATUSES: IncidentStatus[] = ['scheduled', 'in_progress', 'completed']

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const cleanText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)

function parseDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new IncidentError('Некорректная дата')
  return date.toISOString()
}

export async function createIncident(input: Record<string, unknown>, now = new Date()): Promise<Incident> {
  const title = clean(input.title, 120)
  if (!title) throw new IncidentError('Укажите заголовок')
  const impact = (['minor', 'major', 'maintenance'].includes(String(input.impact)) ? input.impact : 'minor') as IncidentImpact
  const known = new Set(COMPONENTS.map((component) => component.id as string))
  const components = Array.isArray(input.components)
    ? [...new Set(input.components.map(String).filter((id) => known.has(id)))]
    : []
  if (components.length === 0) throw new IncidentError('Выберите хотя бы один компонент')
  const text = cleanText(input.text, 2000)
  if (!text) throw new IncidentError('Опишите, что происходит')

  const startsAt = parseDate(input.startsAt)
  const endsAt = parseDate(input.endsAt)
  if (impact === 'maintenance') {
    if (endsAt && startsAt && new Date(endsAt) <= new Date(startsAt)) throw new IncidentError('Окончание раньше начала')
  }
  const status: IncidentStatus =
    impact === 'maintenance'
      ? startsAt && new Date(startsAt).getTime() > now.getTime()
        ? 'scheduled'
        : 'in_progress'
      : 'investigating'

  const incident: Incident = {
    id: `inc_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    title,
    impact,
    status,
    components,
    auto: false,
    createdAt: now.toISOString(),
    resolvedAt: null,
    startsAt: impact === 'maintenance' ? (startsAt ?? now.toISOString()) : null,
    endsAt: impact === 'maintenance' ? endsAt : null,
    updates: [{ at: now.toISOString(), status, text }],
  }
  const store = await getStore()
  await store.saveIncident(incident)
  return incident
}

/** Новая запись в хронологии инцидента; resolved/completed закрывают его. */
export async function updateIncident(id: string, input: Record<string, unknown>, now = new Date()): Promise<Incident> {
  const store = await getStore()
  const incident = await store.findIncident(id)
  if (!incident) throw new IncidentError('Инцидент не найден')
  if (incident.resolvedAt) throw new IncidentError('Инцидент уже закрыт')
  const allowed = incident.impact === 'maintenance' ? MAINTENANCE_STATUSES : OUTAGE_STATUSES
  const status = String(input.status ?? '') as IncidentStatus
  if (!allowed.includes(status)) throw new IncidentError('Недопустимый статус')
  const text =
    cleanText(input.text, 2000) ||
    (status === 'resolved' ? 'Работа восстановлена.' : status === 'completed' ? 'Работы завершены.' : '')
  if (!text) throw new IncidentError('Опишите, что изменилось')

  incident.status = status
  incident.updates.push({ at: now.toISOString(), status, text })
  if (status === 'resolved' || status === 'completed') incident.resolvedAt = now.toISOString()
  await store.saveIncident(incident)
  return incident
}
