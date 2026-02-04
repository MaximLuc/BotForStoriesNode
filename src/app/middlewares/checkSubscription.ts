import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { checkUserSubscribed } from "../../features/subscription/subscription.service.js";
import { renderForceSubscribeScreen } from "../ui/screens.forceSub.js";
import { respond } from "../ui/respond.js";
import { cfg } from "../../shared/config.js";
import { ensureUserForCtx } from "./auth.js";

function isBotBlockedError(e: any) {
  const code = e?.response?.error_code;
  const descr = String(e?.response?.description ?? e?.message ?? "");
  return code === 403 && /bot was blocked by the user/i.test(descr);
}

function isAdminByCfg(ctx: MyContext) {
  const tgId = ctx.from?.id;
  return !!tgId && cfg.adminIds.includes(tgId);
}

export const checkSubscription: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (!ctx.from) return next();

  const role = (ctx.state.user as any)?.role || "";
  if (isAdminByCfg(ctx) || String(role).includes("admin")) return next();

  const ok = await checkUserSubscribed(ctx);
  if (ok) {
    if (!ctx.state?.user) {
      const u = await ensureUserForCtx(ctx);
      if (u) ctx.state.user = u;
    }
    return next();
  }

  const tgId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : "-";
  const kind =
    ctx.callbackQuery ? "callback_query" : (ctx as any).message ? "message" : "other";
  console.log(`🚫 SUB_REQUIRED tgId=${tgId} ${username} kind=${kind}`);

  const isCheckCb =
    !!ctx.callbackQuery &&
    typeof ctx.callbackQuery === "object" &&
    "data" in ctx.callbackQuery &&
    String((ctx.callbackQuery as any).data) === "check_subscriptions";

  if (isCheckCb) return next();

  const scr = await renderForceSubscribeScreen();

  try {
    await respond(ctx, scr.text, {
      inline: scr.inline as any,
      parseMode: scr.parseMode as any,
    });
  } catch (e: any) {
    if (isBotBlockedError(e)) {
      console.log(`⛔ BOT_BLOCKED tgId=${tgId} ${username}`);
      return;
    }
    throw e;
  }
};
