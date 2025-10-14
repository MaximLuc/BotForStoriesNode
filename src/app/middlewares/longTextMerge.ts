import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../../shared/types";
import { isAdmin } from "../../shared/utils";
import { getOrCreateDraft } from "../../features/stories/draft.service";

type Acc = {
  parts: string[];
  lastAt: number;
  kind: string;
};

const accByUser = new Map<number, Acc>();

const MAX_SEG = 4096;
const CONT_THRESHOLD = 4090;
const IDLE_RESET_MS = 2 * 1000;

function now() {
  return Date.now();
}

function sweep() {
  const t = now();
  for (const [uid, a] of accByUser) {
    if (t - a.lastAt > IDLE_RESET_MS) accByUser.delete(uid);
  }
}

export const longTextMerge: MiddlewareFn<MyContext> = async (ctx, next) => {
  sweep();

  const msg: any = ctx.message;
  if (!msg) return next();

  const u = ctx.state.user;
  if (!u || !isAdmin(u)) return next();

  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  const chunk: string | undefined =
    typeof msg?.text === "string"
      ? msg.text
      : typeof msg?.caption === "string"
      ? msg.caption
      : undefined;

  if (typeof chunk !== "string") return next();

  const draft = await getOrCreateDraft(u.tgId);
  const pending = draft.pendingInput;
  if (!pending) {
    accByUser.delete(u.tgId);
    return next();
  }

  const part = chunk;
  const acc = accByUser.get(u.tgId);
  const isContinuation = part.length >= CONT_THRESHOLD;

  if (!acc) {
    accByUser.set(u.tgId, {
      parts: [part],
      lastAt: now(),
      kind: (pending as any).kind ?? "unknown",
    });
    if (isContinuation) return;
  } else {
    acc.parts.push(part);
    acc.lastAt = now();
    if (isContinuation) return;
  }

  const acc2 = accByUser.get(u.tgId);
  const parts = acc2 ? acc2.parts : [part];
  const merged = parts.join("");

  (ctx.state as any)._mergedText = merged;

  accByUser.delete(u.tgId);

  return next();
};
