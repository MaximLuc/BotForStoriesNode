import { Types } from "mongoose"
import { UserEndingChoice, type IUserEndingChoice } from "../../db/models/UserEndingChoice"
import type { MyContext } from "../../shared/types"

export type AccessKind = "chosen" | "extra" | "locked" | "premium_all"

export function isAllPremium(ctx: MyContext): boolean {
  const u = ctx.state.user as any
  if (!u) return false
  if (Array.isArray(u.features) && u.features.includes("all-premium")) return true
  const role = String(u.role || "")
  return role === "premium_admin"
}

export async function getOrCreateChoice(
  userId: Types.ObjectId,
  tgId: number | undefined,
  storyId: Types.ObjectId
) {
  let doc = await UserEndingChoice.findOne({ userId, storyId }) as any as IUserEndingChoice | null
  if (doc) return doc
  doc = await UserEndingChoice.create({ userId, tgId, storyId }) as any as IUserEndingChoice
  return doc
}

export async function tryLockFirstChoice(
  userId: Types.ObjectId,
  tgId: number | undefined,
  storyId: Types.ObjectId,
  endingId: Types.ObjectId
): Promise<"lockedNow" | "alreadySame" | "conflict"> {
  await UserEndingChoice.updateOne(
    { userId, storyId },
    { $setOnInsert: { userId, tgId, storyId, chosenEndingId: null, extraEndingIds: [] } },
    { upsert: true }
  )

  const res2 = await UserEndingChoice.updateOne(
    { userId, storyId, $or: [{ chosenEndingId: null }, { chosenEndingId: { $exists: false } }] },
    { $set: { chosenEndingId: endingId } }
  )

  if (res2.modifiedCount === 1) {
    return "lockedNow"
  }

  const current = await UserEndingChoice.findOne({ userId, storyId })
    .lean<IUserEndingChoice | null>()

  if (current?.chosenEndingId && String(current.chosenEndingId) === String(endingId)) {
    return "alreadySame"
  }

  return "conflict"
}

export async function hasAccessToEnding(
  ctx: MyContext,
  userId: Types.ObjectId,
  storyId: Types.ObjectId,
  endingId: Types.ObjectId
): Promise<AccessKind> {
  if (isAllPremium(ctx)) return "premium_all"
  const choice = await UserEndingChoice.findOne({ userId, storyId }).lean<IUserEndingChoice | null>()
  if (!choice) return "locked"
  if (choice.chosenEndingId && String(choice.chosenEndingId) === String(endingId)) return "chosen"
  if ((choice.extraEndingIds || []).some((id: Types.ObjectId) => String(id) === String(endingId))) return "extra"
  return "locked"
}

export async function grantExtraByToken(
  userId: Types.ObjectId,
  storyId: Types.ObjectId,
  endingId: Types.ObjectId
) {
  await UserEndingChoice.updateOne(
    { userId, storyId },
    { $addToSet: { extraEndingIds: endingId } },
    { upsert: true }
  )
}
