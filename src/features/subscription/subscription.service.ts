import { RequiredChannel } from "../../db/models/RequiredChannel.js"
import type { MyContext } from "../../shared/types.js"
import { logError } from "../../shared/logger.js"

export async function checkUserSubscribed(ctx: MyContext): Promise<boolean> {
  const channels = await RequiredChannel.find().lean()
  if (!channels.length) return true 
  if (!ctx.from) return false

  const telegram = ctx.telegram
  const userId = ctx.from.id

  for (const ch of channels) {
    try {
      const m = await telegram.getChatMember(ch.chatId, userId)
      if (["member","administrator","creator"].includes(m.status)) continue
      else return false
    } catch (e) {
      logError("subscription.checkUserSubscribed.getChatMember", e, { chatId: ch.chatId, userId })
      return false
    }
  }
  return true
}
