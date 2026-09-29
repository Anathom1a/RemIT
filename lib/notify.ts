import { config } from './config'

/**
 * Уведомления о заявках. Пока у продукта нет почтовой рассылки, самый
 * надёжный канал — телеграм-бот: он уже используется для поддержки.
 * Если бот не настроен, функция просто ничего не делает.
 */
export async function notifyTelegram(text: string, chatId?: string): Promise<boolean> {
  const { telegramBotToken } = config.notifications
  const telegramChatId = chatId || config.notifications.telegramChatId
  if (!telegramBotToken || !telegramChatId) return false

  try {
    const response = await fetch(`${config.notifications.telegramApiUrl}/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    // Заявка уже сохранена в базе — уведомление не критично.
    return false
  }
}
