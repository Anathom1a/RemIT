import Link from 'next/link'
import type { LimitNotice } from '@/lib/limit-notice'
import { connectionsWord, sessionsWord } from '@/lib/plans'
import { formatDateTime } from '@/lib/time'

/**
 * Предупреждение в кабинете: подключения обрывались из-за лимита
 * одновременных сессий. Сам разрыв ничего не объясняет, поэтому здесь —
 * причина и понятный выход.
 */
export function LimitBanner({
  notice,
  canProrate,
}: {
  notice: LimitNotice
  /** Есть оплаченная подписка — повышение стоит только разницу за оставшиеся дни. */
  canProrate: boolean
}) {
  const { target } = notice

  return (
    <div className="card border-danger/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 className="font-semibold">Не хватило одновременных сессий</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            За сутки {notice.count} {connectionsWord(notice.count)} прервано: {notice.reason}. Последний раз —{' '}
            {formatDateTime(notice.lastAt)}.{' '}
            {target.negotiable
              ? 'Больше сессий даёт корпоративный тариф — число согласуем под вашу нагрузку.'
              : `На тарифе «${target.name}» их ${target.concurrentSessions}.`}
            {!target.negotiable && canProrate && ' Доплата — только за оставшиеся дни текущей подписки.'}
          </p>
        </div>
        <Link
          href={notice.upgradePath}
          className="shrink-0 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white"
        >
          {target.negotiable
            ? 'Запросить больше сессий'
            : `Перейти на «${target.name}» — ${target.concurrentSessions} ${sessionsWord(target.concurrentSessions)}`}
        </Link>
      </div>
    </div>
  )
}
