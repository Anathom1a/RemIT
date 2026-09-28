import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * Настройки веб-клиента: адрес API, сервер и ключ. Клиент хранит их в
 * localStorage; записываем при каждой загрузке, чтобы человеку ничего не
 * нужно было настраивать и нельзя было случайно увести клиент на чужой сервер.
 */
export function GET() {
  const values = {
    'api-server': config.rustdesk.apiServer,
    'wc-api-server': config.rustdesk.apiServer,
    'custom-rendezvous-server': config.rustdesk.idServer,
    key: config.rustdesk.publicKey,
  }
  const lines = Object.entries(values).map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
  lines.push('window.webclient_magic_queryonline = 0;', "window.ws_host = '';")
  return new Response(lines.join('\n') + '\n', {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' },
  })
}
