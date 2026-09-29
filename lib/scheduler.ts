import { config } from './config'
import { maybeRunBillingJobs } from './billing-jobs'
import { runMonitoring } from './monitoring'
import { reconcileRelays } from './relays'

/**
 * Фоновые задачи внутри сайта. Запускается один раз при старте сервера
 * (instrumentation.ts): раз в минуту — мониторинг, заодно автопродление и
 * чеки (не чаще раза в 10 минут) и сверка ретрансляторов (раз в 5 минут).
 *
 * Раньше эти задачи шли только попутно с heartbeat клиентов; тот путь
 * остаётся, но без клиентов онлайн задачи теперь тоже выполняются.
 */

const GLOBAL_KEY = '__remitScheduler'

export function startScheduler(): void {
  const holder = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>
  if (holder[GLOBAL_KEY] || !config.monitoring.scheduler) return

  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      await runMonitoring().catch((error) => console.error('[monitor]', error))
      await maybeRunBillingJobs().catch((error) => console.error('[billing] фоновые задачи:', error))
      await reconcileRelays().catch((error) => console.error('[relays] сверка:', error))
    } finally {
      busy = false
    }
  }

  const interval = Math.max(10, config.monitoring.intervalSeconds) * 1000
  holder[GLOBAL_KEY] = setInterval(tick, interval)
  holder[GLOBAL_KEY].unref?.()
  // Первый проход — вскоре после старта, когда сервер уже принимает запросы.
  setTimeout(tick, 5000).unref?.()
  console.info(`[scheduler] фоновые задачи: каждые ${interval / 1000} с`)
}
