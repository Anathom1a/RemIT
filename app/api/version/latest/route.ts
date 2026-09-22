import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getLatestRelease } from '@/lib/updates'

export const dynamic = 'force-dynamic'

/**
 * Проверка обновлений в формате клиента RustDesk.
 *
 * Клиент шлёт сюда `{os, os_version, arch, device_id, typ}` и ждёт ответ
 * `{"url": "..."}`. Версию он берёт из последнего сегмента адреса и сам
 * сравнивает её со своей, поэтому адрес заканчивается номером версии.
 *
 * Сегмент `tag` обязателен: при обновлении клиент заменяет его на `download`
 * и скачивает файл из получившегося каталога. Поэтому сервер отвечает
 * адресом вида `/obnovlenie/tag/1.4.2`, а файлы раздаёт по
 * `/obnovlenie/download/1.4.2/<имя файла>`.
 *
 * В фирменной сборке этот адрес прописывается патчем brand-client.py.
 */
async function respond(os: string, channel: string) {
  const release = await getLatestRelease({ os, channel })
  if (!release) return NextResponse.json({ url: '' })

  const base = config.rustdesk.apiServer.replace(/\/$/, '') || `https://${config.brand.domain}`
  return NextResponse.json({ url: `${base}/obnovlenie/tag/${release.version}` })
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, any>
  return respond(String(payload.os ?? ''), String(payload.channel ?? 'stable'))
}

/** GET оставлен для проверки вручную: `curl https://remit.su/api/version/latest?os=windows`. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  return respond(url.searchParams.get('os') ?? '', url.searchParams.get('channel') ?? 'stable')
}
