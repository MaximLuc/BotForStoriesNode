import type { Telegraf } from "telegraf"
import type { MyContext } from "../../shared/types"
import { checkUserSubscribed } from "./subscription.service"
import { renderForceSubscribeScreen } from "../../app/ui/screens.forceSub"
import { Markup } from "telegraf"
import { getScreen } from "../../app/ui/screens"

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
        await ctx.editMessageText(scr.text, {
          parse_mode: scr.parseMode,
          ...ensureMarkup(scr.inline),
        })
      } catch {

      }
      return
    }

    try {
      const main = await getScreen(ctx, "main")
      await ctx.editMessageText(main.text, {
        parse_mode: main.parseMode ?? "Markdown",
        ...ensureMarkup(main.inline),
      })
    } catch {
    }
  })
}
