import { Markup } from "telegraf"
import { RequiredChannel } from "../../db/models/RequiredChannel.js"

export async function renderForceSubscribeScreen() {
  const channels = await RequiredChannel.find().lean()
  const links = channels.map(c =>
    c.username
      ? `• <a href="https://t.me/${c.username}">@${c.username}</a>`
      : `• ${c.title || c.chatId}`
  ).join("\n")

  const text = `Для использования бота нужно быть подписанным на следующие каналы:\n\n${links || "— нет данных —"}\n\nПосле подписки нажмите кнопку ниже.`

  return {
    text,
    inline: Markup.inlineKeyboard([[Markup.button.callback("✅ Проверить", "check_subscriptions")]]),
    parseMode: "HTML" as const,
  }
}
