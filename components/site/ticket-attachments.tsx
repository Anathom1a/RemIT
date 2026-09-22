import type { TicketAttachment } from '@/lib/types'

/**
 * Снимки экрана из обращения. Картинки отдаёт наш маршрут и только автору
 * обращения и поддержке, поэтому открываем их обычной ссылкой — в новой
 * вкладке файл показывается в полном размере.
 */
export function TicketAttachments({ attachments }: { attachments: TicketAttachment[] }) {
  if (!attachments?.length) return null

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.url}>
          <a
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-white/10 transition-colors hover:border-brand-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.url}
              alt="Снимок экрана из обращения"
              loading="lazy"
              className="size-24 object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  )
}
