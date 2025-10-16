import type { MiddlewareFn } from "telegraf"
import type { MyContext } from "../../shared/types"
import { checkUserSubscribed } from "../../features/subscription/subscription.service"
import { renderForceSubscribeScreen } from "../ui/screens.forceSub"
import { getLastMessageId } from "./singleMessage"
import { Markup } from "telegraf"

function ensureMarkup(inline?: ReturnType<typeof Markup.inlineKeyboard>) {
  return inline?.reply_markup ? { reply_markup: inline.reply_markup } : {}
}

export const checkSubscription: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (!ctx.state?.user) return next()
  const role = ctx.state.user.role || ""
  if (role.includes("admin")) return next()


  const ok = await checkUserSubscribed(ctx)
  if (ok) return next()


  const isCheckCb =
    !!ctx.callbackQuery &&
    "data" in ctx.callbackQuery &&
    (ctx.callbackQuery.data as string) === "check_subscriptions"

  if (isCheckCb) {
    return next() 
  }

  const scr = await renderForceSubscribeScreen()

  try {
    await ctx.editMessageText(scr.text, {
      parse_mode: scr.parseMode,
      ...ensureMarkup(scr.inline),
    })
    return
  } catch {}

  const chatId = ctx.chat?.id
  const last = chatId ? getLastMessageId(chatId) : undefined
  if (chatId && last) {
    try {
      await ctx.telegram.editMessageText(chatId, last, undefined, scr.text, {
        parse_mode: scr.parseMode,
        ...ensureMarkup(scr.inline),
      })
      ;(ctx.state as any).rememberMessageId?.(last)
      return
    } catch {}
  }

  const sent = await (ctx.state as any).sendSingle(scr.text, {
    parse_mode: scr.parseMode,
    ...ensureMarkup(scr.inline),
  })
  ;(ctx.state as any).rememberMessageId?.(sent.message_id)
}
