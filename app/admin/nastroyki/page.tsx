import type { Metadata } from 'next'
import { SettingsForm } from '@/components/admin/settings-form'
import { PolicyForm } from '@/components/admin/policy-form'
import { checkRustdeskApi } from '@/lib/admin'
import { getRuntimeSettings } from '@/lib/settings'
import { POLICY_HINTS, getClientPolicy } from '@/lib/policy'
import { formatDateTime } from '@/lib/time'
import { config } from '@/lib/config'

export const metadata: Metadata = { title: 'Настройки' }
export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  const [settings, api, policy] = await Promise.all([getRuntimeSettings(), checkRustdeskApi(), getClientPolicy()])

  const env = [
    { term: 'Домен', value: config.brand.domain },
    { term: 'ID-сервер', value: config.rustdesk.idServer },
    { term: 'Сервер-ретранслятор', value: config.rustdesk.relayServer },
    { term: 'API-сервер для клиентов', value: config.rustdesk.apiServer },
    { term: 'Панель rustdesk-api', value: config.rustdesk.upstream },
    { term: 'Часовой пояс тарификации', value: config.quota.timeZone },
    { term: 'Приём оплаты', value: config.billing.provider === 'yookassa' ? 'ЮKassa' : 'вручную по счёту' },
    { term: 'Магазин ЮKassa', value: config.billing.yookassa.shopId || 'не задан' },
    { term: 'Сервисный токен', value: config.serviceToken ? 'задан' : 'не задан' },
    { term: 'Админы по почте', value: config.admin.emails.join(', ') || 'не заданы' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="mt-1 text-sm text-text-muted">
          Верхний блок меняется на лету, нижний задаётся переменными окружения при развёртывании.
        </p>
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="font-semibold">Тарификация и доступ</h2>
        <div className="mt-5">
          <SettingsForm settings={settings} />
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="font-semibold">Настройки клиентов</h2>
        <p className="mt-1.5 text-sm text-text-muted">
          Эти значения сервер рассылает всем установленным клиентам: они применяются сами, без
          переустановки.{' '}
          {policy.modifiedAt > 0
            ? `Последнее изменение: ${formatDateTime(new Date(policy.modifiedAt))}.`
            : 'Пока ничего не задано.'}
        </p>
        <div className="mt-5">
          <PolicyForm policy={policy} hints={[...POLICY_HINTS]} />
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="font-semibold">Конфигурация развёртывания</h2>
        <p className="mt-1.5 text-sm text-text-muted">
          Меняется в <code className="font-mono">server/.env</code> с перезапуском контейнера.
          Секреты здесь не показываются — только факт, что они заданы.
        </p>
        <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {env.map((row) => (
            <div key={row.term} className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <dt className="text-text-muted">{row.term}</dt>
              <dd className="break-all text-right text-text-primary">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="font-semibold">Проверка связи</h2>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${api.ok ? 'bg-success' : 'bg-danger'}`} />
          <span className={api.ok ? 'text-success' : 'text-danger'}>
            панель {api.ok ? 'отвечает' : 'недоступна'}
          </span>
          <span className="text-text-muted">HTTP {api.status || '—'}</span>
        </p>
        <p className="mt-2 break-all text-xs text-text-muted">{api.detail}</p>
      </div>
    </div>
  )
}
