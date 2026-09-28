import { vkEnabled } from '@/lib/vk'

/** Кнопка входа через VK ID и сообщение об ошибке после возврата с VK. */
export function VkLogin({ error, label = 'Войти через VK ID' }: { error?: string; label?: string }) {
  if (!vkEnabled()) return null
  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-white/10" />
        или
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <a
        href="/api/v1/auth/vk/start?action=login"
        className="flex h-11 w-full items-center justify-center rounded-xl bg-[#0077ff] text-[0.95rem] font-medium text-white
          hover:bg-[#1a86ff]"
      >
        {label}
      </a>
      <p className="text-center text-xs text-text-muted">
        Если аккаунта ещё нет, он будет создан на почту из VK ID — вы принимаете{' '}
        <a href="/dokumenty/oferta" className="underline decoration-dotted">
          оферту
        </a>{' '}
        и{' '}
        <a href="/dokumenty/politika" className="underline decoration-dotted">
          политику конфиденциальности
        </a>
        .
      </p>
      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
    </div>
  )
}
