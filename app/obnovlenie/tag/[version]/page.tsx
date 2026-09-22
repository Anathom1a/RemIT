import { redirect } from 'next/navigation'

/**
 * Адрес выпуска в форме, которую ожидает клиент (`/obnovlenie/tag/1.4.2`).
 * Человека отправляем на обычную страницу выпуска, а клиент этот адрес
 * не открывает: он заменяет `tag` на `download` и качает файл.
 */
export default async function ReleaseTagPage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params
  redirect(`/obnovlenie/${version}`)
}
