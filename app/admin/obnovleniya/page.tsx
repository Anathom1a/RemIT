import type { Metadata } from 'next'
import { ActionButton } from '@/components/admin/action-button'
import { ReleaseForm } from '@/components/admin/release-form'
import { getStore } from '@/lib/store'
import { compareVersions } from '@/lib/updates'
import { formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Обновления' }
export const dynamic = 'force-dynamic'

export default async function AdminReleasesPage() {
  const store = await getStore()
  const releases = (await store.listReleases()).sort((a, b) => compareVersions(b.version, a.version))
  const published = releases.filter((release) => release.published)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Обновления клиента</h1>
        <p className="mt-1 text-sm text-text-muted">
          Опубликованный выпуск клиенты видят при проверке обновлений. Текущая версия в канале stable:{' '}
          {published.find((release) => release.channel === 'stable')?.version ?? 'не опубликована'}
        </p>
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="font-semibold">Новый выпуск</h2>
        <p className="mt-1.5 mb-5 text-sm text-text-secondary">
          Укажите версию, загрузите файлы сборок — они лягут на этот сервер и будут раздаваться с
          вашего домена. Контрольная сумма и размер посчитаются сами. Если сборки лежат во внешнем
          хранилище, вместо загрузки вставьте прямую ссылку.
        </p>
        <ReleaseForm />
      </div>

      <div className="space-y-4">
        {releases.length === 0 && (
          <p className="card p-8 text-center text-sm text-text-muted">Выпусков пока нет.</p>
        )}

        {releases.map((release) => (
          <div key={release.id} className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold">{release.version}</h3>
              <span className="pill !py-0.5 !text-[11px]">{release.channel}</span>
              {release.mandatory && (
                <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-[11px] text-warning">
                  обязательное
                </span>
              )}
              <span className={`text-sm ${release.published ? 'text-success' : 'text-text-muted'}`}>
                {release.published ? `опубликован ${formatDateTime(release.publishedAt)}` : 'черновик'}
              </span>
            </div>

            {release.notes && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{release.notes}</p>
            )}

            <ul className="mt-4 space-y-1.5 text-sm">
              {release.files.map((file) => (
                <li key={`${file.os}-${file.arch}-${file.url}`} className="flex flex-wrap gap-x-2 text-text-muted">
                  <span className="text-text-secondary">
                    {file.os}
                    {file.arch ? ` · ${file.arch}` : ''}
                  </span>
                  <span className="break-all font-mono text-xs">{file.url}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/8 pt-4">
              <ActionButton
                endpoint="/api/v1/admin/releases"
                body={{ id: release.id, published: !release.published }}
                label={release.published ? 'Снять с публикации' : 'Опубликовать'}
                variant={release.published ? 'secondary' : 'primary'}
              />
              <ActionButton
                endpoint={`/api/v1/admin/releases?id=${encodeURIComponent(release.id)}`}
                method="DELETE"
                label="Удалить"
                variant="danger"
                confirm={`Удалить выпуск ${release.version}?`}
              />
              {release.published && (
                <a
                  href={`/obnovlenie/${release.version}`}
                  className="text-sm text-brand-400 underline decoration-dotted"
                  target="_blank"
                  rel="noreferrer"
                >
                  Страница выпуска
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="font-semibold">Как клиенты узнают об обновлении</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-text-secondary">
          <li>
            При каждом запуске клиент спрашивает{' '}
            <code className="font-mono">{config.brand.domain}/api/version/latest</code> и сравнивает версию со
            своей.
          </li>
          <li>
            Если версия новее, в главном окне появляется карточка «Доступна новая версия» с кнопкой
            «Обновить».
          </li>
          <li>
            На установленных Windows и macOS кнопка скачивает файл с нашего сервера и ставит его поверх
            текущей версии; в остальных случаях открывает страницу загрузок.
          </li>
          <li>
            Файлы раздаются с вашего сервера по адресу{' '}
            <code className="font-mono">/api/download/&lt;версия&gt;/&lt;файл&gt;</code>; имена любые —
            сервер подбирает нужный файл по расширению и архитектуре из запроса клиента.
          </li>
          <li>
            Чтобы фирменная сборка проверяла именно наш сервер, соберите её скриптом{' '}
            <code className="font-mono">client/patches/brand-client.py</code>.
          </li>
        </ol>
      </div>
    </div>
  )
}
