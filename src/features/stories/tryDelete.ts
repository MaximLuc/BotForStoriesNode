import type { MyContext } from "../../shared/types.js";
import { logTelegramError } from "../../shared/logger.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tryDeleteUserMessagesHard(
  ctx: MyContext,
  chatId: number,
  ids: number[]
) {
  if (!chatId || !ids?.length) return;
  const uniq = Array.from(new Set(ids)).sort((a, b) => b - a);
  for (const id of uniq) {
    try {
      await ctx.telegram.deleteMessage(chatId, id);
      await sleep(60);
    } catch (e) {
      logTelegramError("tryDeleteUserMessagesHard.first", e, { chatId, id });
      await sleep(180);
      try {
        await ctx.telegram.deleteMessage(chatId, id);
      } catch (e2) {
        logTelegramError("tryDeleteUserMessagesHard.retry", e2, { chatId, id });
      }
    }
  }
}
