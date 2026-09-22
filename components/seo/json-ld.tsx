/**
 * Микроразметка schema.org. Поисковые роботы читают её из тега script,
 * пользователь ничего не видит.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Данные формируются на сервере из наших же значений, посторонней строки здесь быть не может.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
