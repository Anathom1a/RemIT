'use client'

import { useState } from 'react'
import Link from 'next/link'
import { buttonClass } from '@/components/ui/button'

/** Меню сайта на узких экранах: кнопка-гамбургер и выпадающий список. */
export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center rounded-xl border border-white/12 bg-ink-800/70 text-text-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          {open ? (
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-16 z-50 border-b border-white/8 bg-ink-950/98 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-3">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/5 py-3.5 text-[0.95rem] text-text-secondary last:border-0"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 pb-2">
              <Link href="/vhod" onClick={() => setOpen(false)} className={buttonClass('secondary', 'md')}>
                Войти
              </Link>
              <Link href="/registraciya" onClick={() => setOpen(false)} className={buttonClass('primary', 'md')}>
                Начать
              </Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
