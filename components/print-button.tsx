'use client'

/** Печать документа; в диалоге печати браузера есть «Сохранить как PDF». */
export function PrintButton({ label = 'Распечатать или сохранить в PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="doc-button">
      {label}
    </button>
  )
}
