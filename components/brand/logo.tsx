import { config } from '@/lib/config'

/** Знак RemIT: экран с волнами связи. Используется в шапке, кабинете и favicon. */
export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#remit-bg)" />
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="11"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
      <rect x="9" y="11" width="22" height="15" rx="3" stroke="white" strokeWidth="1.8" opacity="0.95" />
      <path d="M16 30h8" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
      <path d="M20 26v4" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
      <path
        d="M16.4 21.2a5 5 0 0 1 7.2 0M18.8 18.4a1.7 1.7 0 0 1 2.4 0"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="remit-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B7BFA" />
          <stop offset="1" stopColor="#2FD8E6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-text-primary">{config.brand.name}</span>
    </span>
  )
}
