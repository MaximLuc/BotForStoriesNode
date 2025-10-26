import type { Telegraf } from "telegraf"
import type { MyContext } from "../../shared/types.js"
import { checkUserSubscribed } from "./subscription.service.js"
import { renderForceSubscribeScreen } from "../../app/ui/screens.forceSub.js"
import { Markup } from "telegraf"
import { getScreen } from "../../app/ui/screens.js"
import { respond } from "../../app/ui/respond.js"
import { logError } from "../../shared/logger.js"

function ensureMarkup(inline?: ReturnType<typeof Markup.inlineKeyboard>) {
  return inline?.reply_markup ? { reply_markup: inline.reply_markup } : {}
}

export function registerSubscriptionUserActions(bot: Telegraf<MyContext>) {
  bot.action("check_subscriptions", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {})

    const ok = await checkUserSubscribed(ctx)

    if (!ok) {
      await ctx.answerCbQuery("Вы ещё не подписаны на все обязательные каналы.", { show_alert: true }).catch(() => {})

 
      try {
        const scr = await renderForceSubscribeScreen()
        await respond(ctx, scr.text, { parseMode: scr.parseMode, inline: scr.inline as any })
      } catch (e) {
        logError("subscription.user.actions.forceSub", e)
      }
      return
    }

    try {
      const main = await getScreen(ctx, "main")
      await respond(ctx, main.text, { parseMode: main.parseMode ?? "Markdown", inline: main.inline as any })
    } catch (e) { logError("subscription.user.actions.toMain", e) }
  })
}
