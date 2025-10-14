import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../../shared/types";
import { User } from "../../db/models/User";
import type { UserDoc } from "../../db/models/User";
import { cfg } from "../../shared/config";

const USER_TTL_MS = 90_000;
const SWEEP_EVERY_MS = 60_000;

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
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    !isAdminRole(cached.user.role)
  ) {
    ctx.state.user = cached.user;
    return next();
  }

  let user = await User.findOne({ tgId });

  if (!user) {
    const firstName = ctx.from.first_name;
    const username = ctx.from.username;
    const shouldBeAdmin = cfg.adminIds.includes(tgId);
    user = await User.create({
      tgId,
      firstName,
      username,
      role: shouldBeAdmin ? "admin" : undefined,
    });
  }

  if (!isAdminRole(user.role)) {
    cache.set(tgId, { user, expiresAt: Date.now() + USER_TTL_MS });
  } else {
    cache.delete(tgId);
  }

  ctx.state.user = user;
  return next();
};
