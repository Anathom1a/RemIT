import { config } from '@/lib/config'

/**
 * Макет окна клиента RemIT для витрины: свой интерфейс, свои подписи,
 * своя полоса остатка бесплатного времени.
 */
export function AppPreview() {
  return (
    <div className="card overflow-hidden shadow-[0_40px_120px_-40px_rgba(59,123,250,0.55)]">
      {/* Заголовок окна */}
      <div className="flex items-center gap-2 border-b border-white/8 bg-ink-850/80 px-4 py-3">
        <span className="size-3 rounded-full bg-danger/80" />
        <span className="size-3 rounded-full bg-warning/80" />
        <span className="size-3 rounded-full bg-success/80" />
        <span className="ml-3 text-sm text-text-secondary">{config.brand.name}</span>
        <span className="ml-auto pill !py-1 !text-xs">
          <span className="size-1.5 rounded-full bg-success" />
          Соединение защищено
        </span>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-2">
        {/* Левая колонка: собственные реквизиты */}
        <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-5">
          <p className="text-xs uppercase tracking-wider text-text-muted">Ваше рабочее место</p>
          <p className="mt-4 text-sm text-text-secondary">ID устройства</p>
          <p className="font-mono text-2xl font-semibold tracking-wider text-text-primary">741 208 365</p>
          <p className="mt-4 text-sm text-text-secondary">Одноразовый пароль</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-xl tracking-widest text-text-primary">k7f2xq</span>
            <span className="pill !py-0.5 !text-[11px]">обновить</span>
          </div>
          <div className="mt-6 space-y-2 text-xs text-text-muted">
            <p>Сервер: {config.rustdesk.idServer}</p>
            <p>Ретранслятор: {config.rustdesk.relayServer}</p>
          </div>
        </div>

        {/* Правая колонка: подключение и остаток времени */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-5">
            <p className="text-xs uppercase tracking-wider text-text-muted">Подключиться к</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-11 flex-1 rounded-xl border border-white/10 bg-ink-900/80 px-3 font-mono text-lg leading-[2.6rem] text-text-secondary">
                318 447 902
              </div>
              <div className="flex h-11 items-center rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 text-sm font-medium text-white">
                Управлять
              </div>
            </div>
            <div className="mt-4 flex gap-2 text-xs text-text-muted">
              <span className="pill !py-1">Передача файлов</span>
              <span className="pill !py-1">Чат</span>
              <span className="pill !py-1">Терминал</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-text-secondary">Бесплатное время сегодня</p>
              <p className="text-sm font-semibold text-text-primary">2 ч 14 мин из 3 ч</p>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/8">
              <div className="h-full w-[74%] rounded-full bg-gradient-to-r from-brand-500 to-cyan-accent" />
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Счётчик обнулится в 00:00 МСК. Подписка снимает ограничение.
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-ink-850/60 p-4">
            <p className="text-xs uppercase tracking-wider text-text-muted">Последние подключения</p>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { name: 'Бухгалтерия · ПК Ольги', time: '42 мин' },
                { name: 'Склад · касса 2', time: '18 мин' },
                { name: 'Директор · ноутбук', time: '9 мин' },
              ].map((item) => (
                <li key={item.name} className="flex items-center justify-between">
                  <span className="text-text-secondary">{item.name}</span>
                  <span className="text-text-muted tabular-nums">{item.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
