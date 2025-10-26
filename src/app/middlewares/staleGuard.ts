import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { logTelegramError } from "../../shared/logger.js";

const STALE_SEC = 36 * 60 * 60;

function isCallbackMessageStale(ctx: MyContext): boolean {
  const msg: any = (ctx.callbackQuery as any)?.message;
  if (!msg?.date) return false;
  const ageSec = Math.floor(Date.now() / 1000) - Number(msg.date);
  return ageSec > STALE_SEC;
}

export const staleGuard: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (!ctx.callbackQuery) return next();

  if (!isCallbackMessageStale(ctx)) {
    return next();
  }

  try {
    const msg: any = (ctx.callbackQuery as any).message;
    if (msg?.chat?.id && msg?.message_id) {
      await ctx.telegram.deleteMessage(msg.chat.id, msg.message_id);
    }
  } catch (e) {
    logTelegramError("staleGuard.deleteMessage", e);
  }

  (ctx.state as any).forceReply = true;
  await ctx.answerCbQuery("Сообщение устарело, отправьте заново").catch(() => {});
  return next();
};

export { isCallbackMessageStale };

