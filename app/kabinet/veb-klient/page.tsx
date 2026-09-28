import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ActionButton } from '@/components/admin/action-button'
import { ShareForm } from '@/components/cabinet/share-form'
import { getCurrentUser } from '@/lib/auth'
import { config } from '@/lib/config'
import { getStore } from '@/lib/store'
import { formatDateTime } from '@/lib/time'
import { hasWebClient, shareUrl } from '@/lib/webclient'
import { purchasablePlans } from '@/lib/plans'

export const metadata: Metadata = { title: 'Веб-клиент' }
export const dynamic = 'force-dynamic'

export default async function WebClientPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/vhod')

  const store = await getStore()
  if (!(await hasWebClient(user.id))) return <Upsell />

  const now = new Date().toISOString()
  const shares = (await store.listWebSharesByUser(user.id)).filter((share) => !share.expiresAt || share.expiresAt > now)
  const devices = await store.listDevicesByUser(user.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Веб-клиент <span className="pill !py-0.5 !text-[11px] align-middle">бета</span>
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Подключение из браузера, без установки. Входит в любой платный тариф.
        </p>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold">Открыть веб-клиент</h2>
        <p className="mt-1.5 text-sm text-text-secondary">
          Вы войдёте в нём автоматически — с вашей адресной книгой и по вашей подписке. Веб-клиент в бета-тесте:
          части функций приложения {config.brand.name} в нём пока нет, возможны сбои.
        </p>
        <a
          href="/webclient"
          target="_blank"
          rel="noopener"
          className="mt-4 inline-flex h-9 items-center rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-3.5 text-sm font-medium text-white"
        >
          Открыть в новой вкладке
        </a>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold">Ссылка для гостя</h2>
        <p className="mt-1.5 mb-4 text-sm text-text-secondary">
          Человек откроет ссылку и сразу подключится к устройству через веб-клиент — без регистрации и установки.
          Пароль устройства хранится зашифрованным и никому не показывается. Одноразовая ссылка сработает один раз.
        </p>
        <ShareForm deviceIds={devices.map((device) => device.rustdeskId)} />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="font-semibold">Действующие ссылки · {shares.length}</h2>
        </div>
        {shares.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-text-muted">Ссылок нет.</p>
        ) : (
          <ul className="divide-y divide-white/8">
            {shares.map((share) => (
              <li key={share.token} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-mono">{share.peerId}</span>
                    <span className="ml-2 text-xs text-text-muted">
                      {share.passwordType === 'once' ? 'одноразовая' : 'многоразовая'} ·{' '}
                      {share.expiresAt ? `до ${formatDateTime(share.expiresAt)}` : 'бессрочно'}
                    </span>
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-text-muted">{shareUrl(share.token)}</p>
                </div>
                <ActionButton
                  endpoint="/api/v1/webclient"
                  body={{ action: 'revoke', token: share.token }}
                  label="Отозвать"
                  variant="danger"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Бесплатный тариф: веб-клиента нет — объясняем и ведём к тарифам. */
function Upsell() {
  const cheapest = purchasablePlans()[0]
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Веб-клиент <span className="pill !py-0.5 !text-[11px] align-middle">бета</span>
        </h1>
        <p className="mt-1 text-sm text-text-muted">Подключение из браузера, без установки.</p>
      </div>
      <div className="card border-brand-500/35 p-6">
        <h2 className="font-semibold">Входит в любой платный тариф</h2>
        <p className="mt-1.5 text-sm text-text-secondary">
          На бесплатном тарифе подключайтесь из приложения {config.brand.name}. Веб-клиент и гостевые ссылки для
          подключения из браузера появятся с подпиской{cheapest ? ` — например, «${cheapest.name}»` : ''}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/kabinet/podpiska"
            className="inline-flex h-9 items-center rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-3.5 text-sm font-medium text-white"
          >
            Выбрать тариф
          </a>
          <a href="/skachat" className="inline-flex h-9 items-center rounded-xl px-3.5 text-sm text-text-secondary hover:text-text-primary">
            Скачать приложение
          </a>
        </div>
      </div>
    </div>
  )
}
