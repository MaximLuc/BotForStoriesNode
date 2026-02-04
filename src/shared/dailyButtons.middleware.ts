import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../shared/types.js";
import { DailyButtons } from "../db/models/DailyButtons.js";

function todayKey() {
  return new Date().toISOString().slice(0, 10); 
}

function inc(path: string) {
  return { $inc: { [path]: 1 } };
}

function normalizeCallback(data: string): string {
  if (/^audio:open:/.test(data)) return "audio:open";
  if (/^audio:close:/.test(data)) return "audio:close";
  if (/^audio:buy:/.test(data)) return "audio:buy";
  if (/^audio:play:/.test(data)) return "audio:play";

  if (/^story:[^:]+$/.test(data)) return "story:open";

  if (/^read_stories:page:\d+$/.test(data)) return "read_stories:page";

  if (/^read:story:[^:]+:p:\d+$/.test(data)) return "read:story:page";

  if (/^read:choose:[^:]+:\d+$/.test(data)) return "ending:choose";

  if (/^read:end:[^:]+:\d+:p:\d+$/.test(data)) return "read:ending:page";

  if (/^ending:buy:confirm:/.test(data)) return "ending:buy:confirm";

  if (/^read:list_from:/.test(data)) return "read:list_from";

  if (data === "main") return "main";
  if (data === "profile") return "profile";
  if (data === "help") return "help";
  if (data === "support") return "support";

  if (data === "admin") return "admin";
  if (/^admin:statistics_audio/.test(data)) return "admin:statistics_audio";
  if (/^admin:add_audio/.test(data)) return "admin:add_audio";
  if (/^admin:add_story_text/.test(data)) return "admin:add_story_text";

  if (data === "buy_tokens") return "buy_tokens";
  if (/^buy_tokens:confirm:/.test(data)) return "buy_tokens:confirm";

  return "other";
}


export const dailyButtonsMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  await next();

  const date = todayKey();

  const updateType = ctx.updateType ?? "unknown";

  const raw =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? String(ctx.callbackQuery.data)
      : "";

  const sets: any = { $setOnInsert: { date } };
  const ops: any[] = [sets, inc(`updates.${updateType}`)];

  if (raw) {
    const key = normalizeCallback(raw);
    const safeKey = key.replace(/\./g, "_");
    ops.push(inc(`buttons.${safeKey}`));
  }

  await DailyButtons.updateOne({ date }, Object.assign({}, ...ops), { upsert: true });
};
