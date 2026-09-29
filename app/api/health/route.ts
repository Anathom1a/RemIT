import { NextResponse } from 'next/server'
import { getStore } from '@/lib/store'
import { readMonitorState } from '@/lib/monitoring'

export const dynamic = 'force-dynamic'

/**
 * Проверка здоровья для сторожа (server/monitor/watchdog.sh) и внешнего
 * мониторинга: 200 — сайт и база работают, 503 — нет. Тяжёлых проверок
 * здесь нет: их делает фоновый мониторинг, а время его последнего прохода
 * отдаётся в ответе (monitorAgeSeconds).
 */
export async function GET() {
  const started = Date.now()
  try {
    const store = await getStore()
    await Promise.race([
      store.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('база не ответила за 3 с')), 3000)),
    ])
    const state = await readMonitorState()
    return NextResponse.json(
      {
        ok: true,
        db: 'up',
        dbMs: Date.now() - started,
        monitorAgeSeconds: state.lastRunAt ? Math.round((Date.now() - new Date(state.lastRunAt).getTime()) / 1000) : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[health]', error)
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
