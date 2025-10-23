import type { MyContext } from "../shared/types.js";
import { UiAnchor, type UiAnchorDoc } from "../db/models/UiAnchor.js";

export async function deletePrevMenuIfExists(ctx: MyContext) {
  if (!ctx.chat?.id || !ctx.from?.id) return;

  const a = await UiAnchor
    .findOne({ chatId: ctx.chat.id, userId: ctx.from.id })
    .lean<UiAnchorDoc>()
    .exec();

  if (!a) return;
  try {
    await ctx.telegram.deleteMessage(a.chatId, a.messageId);
  } catch {
  }
}

export async function saveMenuAnchor(ctx: MyContext, messageId: number) {
  if (!ctx.chat?.id || !ctx.from?.id) return;
  await UiAnchor.updateOne(
    { chatId: ctx.chat.id, userId: ctx.from.id },
    { $set: { messageId, updatedAt: new Date() } },
    { upsert: true }
  ).exec();
}
/// --- IGNORE ---