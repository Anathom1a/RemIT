import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-brand-400'

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-[0_10px_30px_-12px_rgba(59,123,250,0.9)] ' +
    'hover:from-brand-500 hover:to-brand-400',
  secondary: 'border border-white/12 bg-ink-800/70 text-text-primary hover:border-white/25 hover:bg-ink-700/70',
  ghost: 'text-text-secondary hover:text-text-primary',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-13 px-7 text-base',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  )
}
