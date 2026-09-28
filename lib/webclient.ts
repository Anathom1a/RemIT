import { randomBytes } from 'node:crypto'
import { config } from './config'
import { openSecret, sealSecret } from './secret-box'
import { getStore } from './store'
import type { AbPeer, User, WebShare } from './types'

/**
 * Веб-клиент (бета): RustDesk для браузера из сборки lejianwen, раздаётся
 * сайтом из public/webclient. Соединяется с hbbs и hbbr по WebSocket через
 * nginx (порты 21118 и 21119 с TLS). Доступен на любом тарифе.
 */

export const WEBCLIENT_PATH = '/webclient/'
const PURPOSE = 'webshare'

export class ShareError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** Адрес сервера и ключ — их веб-клиент берёт из /api/server-config. */
export function serverInfo() {
  return { id_server: config.rustdesk.idServer, key: config.rustdesk.publicKey }
}

/** Запись адресной книги в формате веб-клиента. */
export function webPeer(peer: AbPeer) {
  return {
    'view-style': 'shrink',
    tm: (Date.now() - 24 * 60 * 60 * 1000) * 1_000_000,
    info: { username: peer.username, hostname: peer.hostname, platform: peer.platform, hash: peer.hash, id: peer.id },
    tmppwd: '',
  }
}

export const SHARE_TTL: Record<string, number | null> = {
  '1h': 60 * 60,
  '1d': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  never: null,
}

export function shareUrl(token: string): string {
  return `https://${config.brand.domain}${WEBCLIENT_PATH}#/?share_token=${token}`
}

/**
 * Ссылка для гостя: откроет веб-клиент и сразу подключит к устройству
 * с сохранённым паролем. once — ссылка сработает один раз.
 */
export async function createShare(
  user: User,
  input: { peerId: unknown; password: unknown; passwordType: unknown; ttl: unknown },
): Promise<WebShare> {
  const peerId = String(input.peerId ?? '').replace(/\s+/g, '')
  const password = String(input.password ?? '')
  if (!/^[0-9A-Za-z_-]{3,64}$/.test(peerId)) throw new ShareError('Укажите ID устройства')
  if (!password || password.length > 128) throw new ShareError('Укажите пароль устройства')
  const ttlKey = String(input.ttl ?? '1d')
  if (!(ttlKey in SHARE_TTL)) throw new ShareError('Неверный срок')
  const ttl = SHARE_TTL[ttlKey]

  const store = await getStore()
  if ((await store.listWebSharesByUser(user.id)).length >= 100) throw new ShareError('Слишком много ссылок — удалите старые')
  const now = Date.now()
  const share: WebShare = {
    token: randomBytes(24).toString('base64url'),
    userId: user.id,
    peerId,
    passwordType: input.passwordType === 'fixed' ? 'fixed' : 'once',
    passwordSecret: sealSecret(password, PURPOSE),
    expiresAt: ttl === null ? null : new Date(now + ttl * 1000).toISOString(),
    createdAt: new Date(now).toISOString(),
  }
  await store.createWebShare(share)
  return share
}

/** Данные для гостя по ссылке; одноразовая ссылка после этого удаляется. */
export async function redeemShare(token: string) {
  const store = await getStore()
  const share = token ? await store.findWebShare(token) : null
  if (!share) throw new ShareError('Ссылка не найдена или уже использована', 404)
  if (share.expiresAt && share.expiresAt <= new Date().toISOString()) {
    await store.deleteWebShare(share.token)
    throw new ShareError('Срок действия ссылки истёк', 410)
  }
  const owner = await store.findUserById(share.userId)
  if (!owner || owner.status !== 'active') throw new ShareError('Ссылка не действует', 410)
  const password = openSecret(share.passwordSecret, PURPOSE)
  if (password === null) throw new ShareError('Ссылка не действует', 410)
  if (share.passwordType === 'once') await store.deleteWebShare(share.token)
  return {
    ...serverInfo(),
    peer: {
      'view-style': 'shrink',
      tm: Date.now() * 1_000_000,
      tmppwd: Buffer.from(password, 'utf8').toString('base64'),
      info: { username: '', hostname: '', platform: '', id: share.peerId },
    },
  }
}
