import { config } from './config'

/**
 * Служебные команды hbbs и hbbr. Работают со своим образом сервера: патч
 * client/patches/server-cmd-hook.py принимает команду по сети, если она
 * подписана REMIT_SERVICE_TOKEN.
 */

export type ServerTarget = 'hbbs' | 'hbbr'

export interface ServerCommand {
  cmd: string
  alias: string
  args: string
  explain: string
}

export const SERVER_COMMANDS: Record<ServerTarget, ServerCommand[]> = {
  hbbs: [
    { cmd: 'h', alias: '', args: '', explain: 'список команд' },
    { cmd: 'relay-servers', alias: 'rs', args: '<адреса через запятую>', explain: 'какие ретрансляторы раздаёт hbbs (список задаётся на странице «Ретрансляторы»)' },
    { cmd: 'ip-blocker', alias: 'ib', args: '[<ip>|<число>] [-]', explain: 'заблокированные адреса: показать, снять блокировку (-)' },
    { cmd: 'ip-changes', alias: 'ic', args: '[<id>|<число>] [-]', explain: 'смены адреса у устройств' },
    { cmd: 'always-use-relay', alias: 'aur', args: '[y|n]', explain: 'всегда соединять через ретранслятор' },
    { cmd: 'must-login', alias: 'ml', args: '[y|n]', explain: 'пускать только клиентов, вошедших в аккаунт' },
    { cmd: 'test-geo', alias: 'tg', args: '<ip1> <ip2>', explain: 'проверка геолокации' },
  ],
  hbbr: [
    { cmd: 'h', alias: '', args: '', explain: 'список команд' },
    { cmd: 'blacklist-add', alias: 'ba', args: '<ip>', explain: 'добавить адрес в чёрный список (ограничение скорости)' },
    { cmd: 'blacklist-remove', alias: 'br', args: '<ip>', explain: 'убрать из чёрного списка' },
    { cmd: 'blacklist', alias: 'b', args: '[<ip>]', explain: 'показать чёрный список' },
    { cmd: 'blocklist-add', alias: 'Ba', args: '<ip>', explain: 'полностью заблокировать адрес' },
    { cmd: 'blocklist-remove', alias: 'Br', args: '<ip>', explain: 'снять блокировку' },
    { cmd: 'blocklist', alias: 'B', args: '[<ip>]', explain: 'показать заблокированные' },
    { cmd: 'downgrade-threshold', alias: 'dt', args: '[значение]', explain: 'порог понижения скорости' },
    { cmd: 'downgrade-start-check', alias: 't', args: '[секунды]', explain: 'через сколько начинать проверку' },
    { cmd: 'limit-speed', alias: 'ls', args: '[Мбит/с]', explain: 'скорость для понижённых соединений' },
    { cmd: 'total-bandwidth', alias: 'tb', args: '[Мбит/с]', explain: 'общая полоса ретранслятора' },
    { cmd: 'single-bandwidth', alias: 'sb', args: '[Мбит/с]', explain: 'полоса одного соединения' },
    { cmd: 'usage', alias: 'u', args: '', explain: 'текущая нагрузка' },
  ],
}

export class ServerCmdError extends Error {}

/** Отправляет команду основному hbbs или hbbr и возвращает ответ сервера. */
export async function sendServerCommand(target: ServerTarget, line: string): Promise<string> {
  const address = target === 'hbbs' ? config.rustdesk.hbbsCommand : config.rustdesk.hbbrCommand
  return sendCommandTo({ address, token: config.serviceToken, target, line, label: target })
}

/**
 * Команда любому узлу: основному серверу или отдельному ретранслятору
 * (у ретранслятора свой токен — см. lib/relays.ts).
 */
export async function sendCommandTo(options: {
  address: string
  token: string
  target: ServerTarget
  line: string
  label: string
}): Promise<string> {
  const { address, token, target, label } = options
  const text = options.line.trim().replace(/\s+/g, ' ')
  const [name] = text.split(' ')
  const known = SERVER_COMMANDS[target].some((command) => command.cmd === name || command.alias === name)
  if (!known) throw new ServerCmdError('Неизвестная команда. Выберите из списка.')
  if (!token) throw new ServerCmdError('Не задан токен команд')

  const separator = address.lastIndexOf(':')
  const host = separator > 0 ? address.slice(0, separator) : address
  const port = separator > 0 ? Number(address.slice(separator + 1)) : 21117
  const { Socket } = await import('node:net')

  return new Promise((resolve, reject) => {
    const socket = new Socket()
    const chunks: Buffer[] = []
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      if (error) reject(error)
      else resolve(Buffer.concat(chunks).toString('utf8'))
    }
    socket.setTimeout(4000)
    socket.on('data', (chunk) => chunks.push(chunk))
    socket.once('end', () => finish())
    socket.once('close', () => finish())
    socket.once('timeout', () =>
      chunks.length ? finish() : finish(new ServerCmdError(`${label} не ответил. Нужен свой образ сервера с патчем команд.`)),
    )
    socket.once('error', (error) => finish(new ServerCmdError(`${label} недоступен: ${error.message}`)))
    socket.connect(port, host, () => socket.write(`REMIT-CMD ${token}\n${text}`))
  })
}
