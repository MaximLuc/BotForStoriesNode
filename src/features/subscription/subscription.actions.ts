import type { Telegraf } from "telegraf"
import type { MyContext } from "../../shared/types.js"
import { Markup } from "telegraf"
import { RequiredChannel } from "../../db/models/RequiredChannel.js"
import { isAdmin } from "../../shared/utils.js"
import { getLastMessageId } from "../../app/middlewares/singleMessage.js"
import { respond } from "../../app/ui/respond.js"
import { logError } from "../../shared/logger.js"

function ensureMarkup(inline?: ReturnType<typeof Markup.inlineKeyboard>) {
  return inline?.reply_markup ? { reply_markup: inline.reply_markup } : {}
}

function parseUsername(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  if (t.startsWith("@")) return t.slice(1).trim()
  const m = t.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)/i)
  return m ? m[1] : null
}

async function buildChannelsText(notice?: string) {
  const list = await RequiredChannel.find().lean()
  const header = `📢 <b>Управление обязательными каналами</b>\n\n`
  const rows = list.length
    ? list.map(c => `• ${c.title || (c.username ? `@${c.username}` : c.chatId)}`).join("\n")
    : "Пока ни одного канала не задано."
  const tip =
    `\n\nОтправьте <b>@username</b> или ссылку <b>https://t.me/…</b>, чтобы <b>добавить</b>.\n` +
    `Отправьте тот же @username ещё раз, чтобы <b>удалить</b>.\n` +
    `Важно: этот бот должен быть <b>администратором</b> в канале, чтобы проверять подписку.`
  const body = `${header}${rows}${tip}`
  return notice ? `${notice}\n\n${body}` : body
}

async function redrawChannelsScreen(ctx: MyContext, notice?: string) {
  const text = await buildChannelsText(notice)
  const kb = Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню", "admin")]])

  await respond(ctx, text, { parseMode: "HTML", inline: kb as any })
}

export function registerSubscriptionAdminActions(bot: Telegraf<MyContext>) {

 
  bot.action("admin:channels", async (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return ctx.answerCbQuery()
    await ctx.answerCbQuery()
    return redrawChannelsScreen(ctx)
  })

 
  bot.on("message", async (ctx, next) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return next()

    const msg: any = ctx.message
    if (!msg || typeof msg !== "object" || !("text" in msg)) return next()

    const input: string = (msg.text as string).trim()
    const username = parseUsername(input)
    if (!username) return next() 

  
    const chatId = ctx.chat?.id
    const msgId = msg?.message_id
    if (chatId && msgId) {
      try { await ctx.telegram.deleteMessage(chatId, msgId) } catch (e) { logError("subscription.admin.deleteUserMessage", e, { chatId, msgId }) }
    }

    const existing = await RequiredChannel.findOne({ username }).lean()
    if (existing) {
      await RequiredChannel.deleteOne({ _id: (existing as any)._id })
      return redrawChannelsScreen(ctx, `🗑 Канал @${username} удалён.`)
    }

    const chat = await ctx.telegram.getChat(`@${username}`).catch(() => null)
    if (!chat) {
      return redrawChannelsScreen(ctx, "⚠️ Не удалось найти канал. Убедитесь, что бот добавлен туда как админ.")
    }

    const chatIdStr = String((chat as any).id)
    const title = "title" in (chat as any) ? ((chat as any).title as string) : undefined

    await RequiredChannel.create({ chatId: chatIdStr, title, username })
    return redrawChannelsScreen(ctx, `✅ Канал @${username} добавлен.`)
  })
}
