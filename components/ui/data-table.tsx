import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Колонка-заголовок карточки на узких экранах. */
  primary?: boolean
  /** Колонка с действиями: в карточке выводится без подписи, отдельной строкой. */
  actions?: boolean
}

/**
 * Таблица, которая на телефоне превращается в список карточек.
 * Горизонтальная прокрутка таблиц на мобильном неудобна, поэтому на узких
 * экранах каждая строка показывается как карточка «подпись — значение».
 */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  empty = 'Пока нет данных.',
  minWidth = 720,
}: {
  columns: Column<T>[]
  rows: T[]
  getKey: (row: T) => string
  empty?: string
  minWidth?: number
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-text-muted sm:px-6">{empty}</p>
  }

  const primary = columns.find((column) => column.primary) ?? columns[0]
  const rest = columns.filter((column) => column !== primary)

  return (
    <>
      {/* Телефон: карточки */}
      <ul className="divide-y divide-white/8 md:hidden">
        {rows.map((row) => (
          <li key={getKey(row)} className="px-5 py-4">
            <div className="text-sm font-medium text-text-primary">{primary.render(row)}</div>
            <dl className="mt-2.5 space-y-1.5">
              {rest
                .filter((column) => !column.actions)
                .map((column) => (
                  <div key={column.key} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="shrink-0 text-text-muted">{column.header}</dt>
                    <dd className="text-right text-text-secondary">{column.render(row)}</dd>
                  </div>
                ))}
            </dl>
            {rest
              .filter((column) => column.actions)
              .map((column) => (
                <div key={column.key} className="mt-3 flex flex-wrap gap-2">
                  {column.render(row)}
                </div>
              ))}
          </li>
        ))}
      </ul>

      {/* Планшет и шире: обычная таблица */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="text-left text-text-muted">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-6 py-3 font-medium">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getKey(row)} className="border-t border-white/8">
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-3.5">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
