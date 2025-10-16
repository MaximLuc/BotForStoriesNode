import type { Telegraf } from "telegraf"
import { BroadcastMessage } from "../../db/models/BroadcastMessage"

type Delivery = { tgId: number; messageId: number; deleted?: boolean }
type BroadcastLean = { _id: any; deliveries: Delivery[] }

export function registerBroadcastSweeper(bot: Telegraf) {
  setInterval(async () => {
    const now = new Date()
    const toDelete = await BroadcastMessage.find(
      { status: "sent", deleteAt: { $lte: now } },
      { deliveries: 1 } 
    ).lean<BroadcastLean[]>().limit(50)

    for (const br of toDelete) {
      if (!br.deliveries?.length) continue
      for (const d of br.deliveries) {
        if (d.deleted) continue
        try { await bot.telegram.deleteMessage(d.tgId, d.messageId) } catch {}
        await BroadcastMessage.updateOne(
          { _id: br._id, "deliveries.tgId": d.tgId, "deliveries.messageId": d.messageId },
          { $set: { "deliveries.$.deleted": true } }
        )
      }
      const left = br.deliveries.some(x => !x.deleted)
      if (!left) {
        await BroadcastMessage.updateOne({ _id: br._id }, { $set: { status: "deleted" } })
      }
    }
  }, 60_000)
}
