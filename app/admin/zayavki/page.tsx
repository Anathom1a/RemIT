import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { TrialGrant } from '@/components/admin/trial-grant'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Заявки' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; className: string }> = {
  new: { label: 'новая', className: 'text-warning' },
  in_progress: { label: 'в работе', className: 'text-brand-400' },
  approved: { label: 'пробный выдан', className: 'text-success' },
  rejected: { label: 'отклонена', className: 'text-text-muted' },
}

export default async function AdminLeadsPage() {
  const store = await getStore()
  const leads = await store.listLeads(100)

  const accounts = new Map<string, string | null>()
  for (const lead of leads) {
    if (!accounts.has(lead.email)) {
      accounts.set(lead.email, (await store.findUserByEmail(lead.email))?.id ?? null)
    }
  }

  const fresh = leads.filter((lead) => lead.status === 'new').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Заявки на пробный период</h1>
        <p className="mt-1 text-sm text-text-muted">
          Всего заявок: {leads.length} · новых: {fresh} · пробный период выдаём до {config.trial.maxDays} дней
        </p>
      </div>

      {leads.length === 0 ? (
        <p className="card p-8 text-center text-sm text-text-muted">
          Заявок пока нет. Форма находится на странице{' '}
          <a href="/probnyy-period" className="text-brand-400 underline decoration-dotted">
            «Пробный период»
          </a>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <div key={lead.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {lead.name}
                    {lead.company && <span className="text-text-secondary"> · {lead.company}</span>}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    <a href={`mailto:${lead.email}`} className="underline decoration-dotted">
                      {lead.email}
                    </a>
                    {lead.phone && ` · ${lead.phone}`}
                    {lead.devices && ` · устройств: ${lead.devices}`}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {formatDateTime(lead.createdAt)}
                    {lead.handledAt && ` · обработана ${formatDateTime(lead.handledAt)}`}
                  </p>
                </div>
                <span className={`text-sm ${STATUS[lead.status]?.className ?? ''}`}>
                  {STATUS[lead.status]?.label ?? lead.status}
                </span>
              </div>

              {lead.comment && (
                <p className="mt-4 whitespace-pre-line rounded-xl border border-white/8 bg-ink-850/50 p-4 text-sm leading-relaxed text-text-secondary">
                  {lead.comment}
                </p>
              )}

              <div className="mt-5 space-y-3 border-t border-white/8 pt-4">
                <TrialGrant
                  leadId={lead.id}
                  defaultPlan={config.trial.defaultPlan}
                  defaultDays={config.trial.defaultDays}
                  maxDays={config.trial.maxDays}
                  hasAccount={Boolean(accounts.get(lead.email))}
                />
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    endpoint="/api/v1/admin/leads"
                    body={{ id: lead.id, action: 'status', status: 'in_progress' }}
                    label="В работе"
                  />
                  <ActionButton
                    endpoint="/api/v1/admin/leads"
                    body={{ id: lead.id, action: 'status', status: 'rejected' }}
                    label="Отклонить"
                    variant="danger"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
