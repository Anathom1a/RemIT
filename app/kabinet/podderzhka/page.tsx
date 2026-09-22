import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SupportForm } from '@/components/site/support-form'
import { getCurrentUser } from '@/lib/auth'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import type { TicketStatus } from '@/lib/types'

export const metadata: Metadata = { title: 'Поддержка' }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Принято',
  in_progress: 'В работе',
  answered: 'Отвечено',
  closed: 'Закрыто',
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  new: 'border-white/15 text-text-secondary',
  in_progress: 'border-warning/40 text-warning',
  answered: 'border-success/40 text-success',
  closed: 'border-white/10 text-text-muted',
}

export default async function SupportPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const store = await getStore()
  const tickets = await store.listUserTickets(user.id, 50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Поддержка</h1>
        <p className="mt-1 text-sm text-text-muted">
          Опишите проблему — ответим в этом же разделе. Обращения от аккаунтов с действующей подпиской
          разбираем первыми.
        </p>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Новое обращение</h2>
        <SupportForm />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Мои обращения</h2>
        </div>
        {tickets.length === 0 ? (
          <p className="px-6 py-8 text-sm text-text-muted">Обращений пока не было.</p>
        ) : (
          <ul className="divide-y divide-white/8">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary">{ticket.subject}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{formatDateTime(ticket.createdAt)}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[ticket.status]}`}
                  >
                    {STATUS_LABEL[ticket.status]}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-text-secondary">{ticket.message}</p>
                {ticket.answer ? (
                  <div className="mt-4 rounded-xl border border-brand-500/30 bg-ink-850/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-text-muted">Ответ поддержки</p>
                    <p className="mt-1.5 whitespace-pre-line text-sm text-text-primary">{ticket.answer}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
