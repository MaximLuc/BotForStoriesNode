import { Types } from "mongoose";
import { Story } from "../../db/models/Story.js";
import { UserStoryAccess } from "../../db/models/UserStoryAccess.js";
import { spendTokens } from "../tokens/wallet.service.js";

export async function getStoryEntryPrice(storyId: string): Promise<number> {
  const s = await Story.findById(storyId).select({ entryTokens: 1, isPublished: 1 }).lean<any>();
  if (!s || !s.isPublished) return -1;
  return Number(s.entryTokens ?? 0);
}

export async function hasStoryAccess(userId: Types.ObjectId, storyId: Types.ObjectId) {
  const doc = await UserStoryAccess.findOne({ userId, storyId }).lean();
  return !!doc;
}

export async function tryBuyStoryAccess(params: {
  userId: Types.ObjectId;
  tgId?: number;
  storyId: string;
  price: number;
}): Promise<{ ok: boolean; reason?: "no_balance" | "not_found" | "already" }> {
  const { userId, tgId, storyId, price } = params;
  const p = Math.max(0, Math.floor(price));

  const story = await Story.findById(storyId).select({ _id: 1, isPublished: 1 }).lean<any>();
  if (!story || !story.isPublished) return { ok: false, reason: "not_found" };

  if (p <= 0) return { ok: true };

  const storyObjId = new Types.ObjectId(storyId);

  const already = await UserStoryAccess.findOne({ userId, storyId: storyObjId }).lean();
  if (already) return { ok: true, reason: "already" };

  const spent = await spendTokens(userId, p);
  if (!spent) return { ok: false, reason: "no_balance" };

  try {
    await UserStoryAccess.create({
      userId,
      tgId,
      storyId: storyObjId,
      paidTokens: p,
      unlockedAt: new Date(),
    });
  } catch (e: any) {

  }

  return { ok: true };
}
