import type { MiddlewareFn } from "telegraf"
import type { MyContext } from "../../shared/types.js"
import { checkUserSubscribed } from "../../features/subscription/subscription.service.js"
import { renderForceSubscribeScreen } from "../ui/screens.forceSub.js"
import { respond } from "../ui/respond.js"

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
  await respond(ctx, scr.text, { inline: scr.inline as any, parseMode: scr.parseMode as any })
}
