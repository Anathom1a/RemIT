import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { TicketAnswer } from '@/components/admin/ticket-answer'
import { TicketAttachments } from '@/components/site/ticket-attachments'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import type { TicketStatus } from '@/lib/types'

export const metadata: Metadata = { title: 'Обращения' }
export const dynamic = 'force-dynamic'

const STATUS: Record<TicketStatus, { label: string; className: string }> = {
  new: { label: 'новое', className: 'text-warning' },
  in_progress: { label: 'в работе', className: 'text-brand-400' },
  answered: { label: 'отвечено', className: 'text-success' },
  closed: { label: 'закрыто', className: 'text-text-muted' },
}

export default async function AdminTicketsPage() {
  const store = await getStore()
  const tickets = await store.listTickets(200)

  const emails = new Map<string, string>()
  for (const ticket of tickets) {
    if (!emails.has(ticket.userId)) {
      emails.set(ticket.userId, (await store.findUserById(ticket.userId))?.email ?? '—')
    }
  }

  const fresh = tickets.filter((ticket) => ticket.status === 'new').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Обращения в поддержку</h1>
        <p className="mt-1 text-sm text-text-muted">
          Всего: {tickets.length} · новых: {fresh} · ответ виден пользователю в разделе «Поддержка»
        </p>
      </div>

      {tickets.length === 0 ? (
        <p className="card p-8 text-center text-sm text-text-muted">
          Обращений пока нет. Форма находится в кабинете, в разделе{' '}
          <a href="/kabinet/podderzhka" className="text-brand-400 underline decoration-dotted">
            «Поддержка»
          </a>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">{ticket.subject}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    <a
                      href={`mailto:${emails.get(ticket.userId)}`}
                      className="underline decoration-dotted"
                    >
                      {emails.get(ticket.userId)}
                    </a>
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {formatDateTime(ticket.createdAt)}
                    {ticket.answeredAt && ` · отвечено ${formatDateTime(ticket.answeredAt)}`}
                  </p>
                </div>
                <span className={`text-sm ${STATUS[ticket.status].className}`}>
                  {STATUS[ticket.status].label}
                </span>
              </div>

              <p className="mt-4 whitespace-pre-line rounded-xl border border-white/8 bg-ink-850/50 p-4 text-sm leading-relaxed text-text-secondary">
                {ticket.message}
              </p>
              <TicketAttachments attachments={ticket.attachments} />

              <div className="mt-5 space-y-3 border-t border-white/8 pt-4">
                <TicketAnswer ticketId={ticket.id} answer={ticket.answer} />
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    endpoint="/api/v1/admin/tickets"
                    body={{ id: ticket.id, status: 'in_progress' }}
                    label="В работе"
                  />
                  <ActionButton
                    endpoint="/api/v1/admin/tickets"
                    body={{ id: ticket.id, status: 'closed' }}
                    label="Закрыть"
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
