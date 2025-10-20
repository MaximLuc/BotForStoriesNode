import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { User, type UserDoc } from "../../db/models/User.js";
import { cfg } from "../../shared/config.js";
import { addTokens } from "../../features/tokens/wallet.service.js";
import { Types } from "mongoose";

const USER_TTL_MS = 90_000;
const SWEEP_EVERY_MS = 60_000;
const STARTER_TOKENS = 5;

type CacheEntry = { user: UserDoc; expiresAt: number };
const cache = new Map<number, CacheEntry>();
let lastSweep = Date.now();

function isAdminRole(role?: string) {
  return role === "admin" || role === "premium_admin";
}

function sweep() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  for (const [uid, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(uid);
  }
  lastSweep = now;
}

export function invalidateUser(tgId: number) {
  cache.delete(tgId);
}

export function clearUserCache() {
  cache.clear();
}

export const auth: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (!ctx.from) return next();
  sweep();

  const tgId = ctx.from.id;

  const cached = cache.get(tgId);
  if (cached && cached.expiresAt > Date.now() && !isAdminRole(cached.user.role)) {
    ctx.state.user = cached.user;
    return next();
  }

  const shouldBeAdmin = cfg.adminIds.includes(tgId);

  const upsertUpdate: any = {
    $setOnInsert: {
      tgId,
      starterTokensGranted: false,
    },
    $set: {
      firstName: ctx.from.first_name ?? "",
      username: ctx.from.username ?? null,
      ...(shouldBeAdmin ? { role: "admin" } : {}),
    },
  };

  const userDoc = await User.findOneAndUpdate(
    { tgId },
    upsertUpdate,
    { upsert: true, new: true } 
  ).catch(async (e: any) => {
    if (e?.code === 11000) {
      return await User.findOne({ tgId });
    }
    throw e;
  });

  let user = userDoc as UserDoc | null;
  if (!user) user = (await User.findOne({ tgId })) as UserDoc | null;
  if (!user) return next();

  if (!user.starterTokensGranted) {
    const updated = await User.findOneAndUpdate(
      { tgId, starterTokensGranted: false },
      { $set: { starterTokensGranted: true } },
      { new: true }
    );
    if (updated) {
      await addTokens(updated._id as unknown as Types.ObjectId, STARTER_TOKENS);
      user = updated as UserDoc;
    } else {
      user = (await User.findOne({ tgId })) as UserDoc;
    }
  }

  if (!isAdminRole(user.role)) {
    cache.set(tgId, { user, expiresAt: Date.now() + USER_TTL_MS });
  } else {
    cache.delete(tgId);
  }

  ctx.state.user = user;
  return next();
};
