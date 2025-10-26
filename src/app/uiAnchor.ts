import type { MyContext } from "../shared/types.js";
import { UiAnchor, type UiAnchorDoc } from "../db/models/UiAnchor.js";
import { logTelegramError } from "../shared/logger.js";

export async function deletePrevMenuIfExists(ctx: MyContext) {
  if (!ctx.chat?.id || !ctx.from?.id) return;

  const a = await UiAnchor
    .findOne({ chatId: ctx.chat.id, userId: ctx.from.id })
    .lean<UiAnchorDoc>()
    .exec();

  if (!a) return;
  try {
    await ctx.telegram.deleteMessage(a.chatId, a.messageId);
  } catch (e) { logTelegramError("uiAnchor.deletePrevMenuIfExists.delete", e, { chatId: a.chatId, messageId: a.messageId }) }
}

export async function saveMenuAnchor(ctx: MyContext, messageId: number) {
  if (!ctx.chat?.id || !ctx.from?.id) return;
  await UiAnchor.updateOne(
    { chatId: ctx.chat.id, userId: ctx.from.id },
    { $set: { messageId, updatedAt: new Date() } },
    { upsert: true }
  ).exec();
}
