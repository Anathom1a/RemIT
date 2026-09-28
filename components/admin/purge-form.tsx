import { JsonForm, inputClass } from '@/components/cabinet/json-form'

/** Очистка журнала: удалить записи старше N дней. */
export function PurgeForm({ kind, note }: { kind: 'file' | 'alarm' | 'login'; note?: string }) {
  return (
    <JsonForm
      endpoint="/api/v1/admin/logs"
      body={{ action: 'purge', kind }}
      submitLabel="Удалить старше"
      pendingLabel="Удаляем…"
      variant="secondary"
      className="flex flex-wrap items-center gap-2"
    >
      <input
        name="days"
        type="number"
        min={0}
        max={3650}
        defaultValue={90}
        required
        className={`${inputClass} w-24`}
        aria-label="Дней"
      />
      <span className="text-sm text-text-muted">дн.{note ? ` · ${note}` : ''}</span>
    </JsonForm>
  )
}
