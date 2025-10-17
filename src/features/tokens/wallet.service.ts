import { Types } from "mongoose"
import { UserWallet, type IUserWallet } from "../../db/models/UserWallet"

export async function getOrCreateWallet(userId: Types.ObjectId, tgId?: number) {
  let w = await UserWallet.findOne({ userId }).lean<IUserWallet | null>()
  if (w) return w
  await UserWallet.updateOne({ userId }, { $setOnInsert: { userId, tgId, tokens: 0 } }, { upsert: true })
  w = await UserWallet.findOne({ userId }).lean<IUserWallet | null>()
  return w ?? { _id: new Types.ObjectId(), userId, tgId, tokens: 0, createdAt: new Date(), updatedAt: new Date() }
}

export async function getBalance(userId: Types.ObjectId): Promise<number> {
  const w = await UserWallet.findOne({ userId }).lean<IUserWallet | null>()
  return w?.tokens ?? 0
}

export async function spendOneToken(userId: Types.ObjectId): Promise<boolean> {
  const updated = await UserWallet.findOneAndUpdate(
    { userId, tokens: { $gt: 0 } },
    { $inc: { tokens: -1 } },
    { new: true }
  ).lean<IUserWallet | null>()
  return !!updated
}

export async function addTokens(userId: Types.ObjectId, amount: number) {
  await UserWallet.updateOne({ userId }, { $inc: { tokens: amount } }, { upsert: true })
}
