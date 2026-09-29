/**
 * Вызывается один раз при старте сервера Next.js. Запускает фоновые задачи:
 * мониторинг, автопродление, сверку ретрансляторов (lib/scheduler.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startScheduler } = await import('./lib/scheduler')
  startScheduler()
}
