import { humanDuration } from '@/lib/time'

/**
 * Кольцо остатка бесплатного времени. Показывает, сколько из 3 часов в сутки
 * уже израсходовано, и сколько осталось до обнуления в 00:00 МСК.
 */
export function QuotaRing({
  usedSeconds,
  limitSeconds,
  size = 200,
}: {
  usedSeconds: number
  limitSeconds: number | null
  size?: number
}) {
  const unlimited = limitSeconds === null
  const ratio = unlimited ? 1 : Math.min(1, limitSeconds === 0 ? 1 : usedSeconds / limitSeconds)
  const remaining = unlimited ? null : Math.max(0, limitSeconds - usedSeconds)
  const stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = unlimited ? circumference : circumference * (1 - ratio)
  const color = unlimited || ratio < 0.7 ? 'var(--color-brand-400)' : ratio < 1 ? 'var(--color-warning)' : 'var(--color-danger)'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - dash}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {unlimited ? (
          <>
            <span className="text-2xl font-semibold">Без лимита</span>
            <span className="mt-1 text-sm text-text-muted">Подписка активна</span>
          </>
        ) : (
          <>
            <span className="text-3xl font-semibold tabular-nums">{humanDuration(remaining ?? 0)}</span>
            <span className="mt-1 text-sm text-text-muted">осталось сегодня</span>
          </>
        )}
      </div>
    </div>
  )
}
