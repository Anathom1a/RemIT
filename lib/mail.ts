import nodemailer, { type Transporter } from 'nodemailer'
import { config, isProduction } from './config'

/**
 * Отправка писем пользователям. Пока в ней одно письмо — ссылка для сброса
 * пароля, — но транспорт общий: подтверждение почты и напоминания об
 * окончании подписки встанут сюда же.
 */

let transporter: Transporter | null = null

export function isMailConfigured(): boolean {
  return Boolean(config.mail.host)
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
      // Не держим соединение открытым между письмами: их мало, а висящее
      // соединение почтовые сервисы рвут по таймауту.
      pool: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }
  return transporter
}

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

/**
 * Отправляет письмо. Возвращает false, если почта не настроена или сервер
 * отказал, — вызывающий решает, что сказать пользователю. Исключений наружу
 * не бросает: сбой почты не должен ронять страницу.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (!isMailConfigured()) {
    // В разработке печатаем письмо в журнал, чтобы проверить сценарий без
    // почтового сервера. В продакшене — нет: в письме одноразовая ссылка.
    if (!isProduction) console.info(`[mail] почта не настроена, письмо для ${message.to}:\n${message.text}`)
    else console.warn(`[mail] почта не настроена, письмо для ${message.to} не отправлено`)
    return false
  }
  try {
    await getTransporter().sendMail({ from: config.mail.from, ...message })
    return true
  } catch (error) {
    console.error(`[mail] не удалось отправить письмо для ${message.to}:`, error)
    return false
  }
}

/** Экранирование для HTML-версии письма. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '"' ? '&quot;' : '&#39;',
  )
}

/** Проверка связи с почтовым сервером (вход, TLS) — для мониторинга. */
export async function verifyMail(): Promise<void> {
  await getTransporter().verify()
}
