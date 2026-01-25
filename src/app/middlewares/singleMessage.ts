import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { logTelegramError } from "../../shared/logger.js";

type Entry = { messageId: number; updatedAt: number };
const lastByChat = new Map<number, Entry>();

const SWEEP_EVERY_MS = 60_000;
const KEEP_MS = 30 * 60_000;
let lastSweep = Date.now();

async function safeDelete(ctx: MyContext, chatId: number, messageId: number) {
  try {
    await ctx.telegram.deleteMessage(chatId, messageId);
  } catch (e) { logTelegramError("singleMessage.safeDelete", e, { chatId, messageId }) }
}

function sweep() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  for (const [chatId, entry] of lastByChat) {
    if (now - entry.updatedAt > KEEP_MS) lastByChat.delete(chatId);
  }
  lastSweep = now;
}

export const singleMessage: MiddlewareFn<MyContext> = async (ctx, next) => {
  sweep();
  const chatId = ctx.chat?.id;

  const state = ((ctx as any).state ||= {});

  state.sendSingle = async (text: string, extra?: any) => {
    if (!chatId) return ctx.reply(text, extra);
    const prev = lastByChat.get(chatId)?.messageId;
    if (prev) await safeDelete(ctx, chatId, prev);
    const sent = await ctx.reply(text, extra);
    lastByChat.set(chatId, {
      messageId: sent.message_id,
      updatedAt: Date.now(),
    });
    return sent;
  };

  state.sendSingleInvoice = async (invoice: any) => {
    if (!chatId) return (ctx as any).replyWithInvoice(invoice);

    const prev = lastByChat.get(chatId)?.messageId;
    if (prev) await safeDelete(ctx, chatId, prev);

    const sent = await (ctx as any).replyWithInvoice(invoice);
    lastByChat.set(chatId, { messageId: sent.message_id, updatedAt: Date.now() });
    return sent;
  };

  state.rememberMessageId = (msgId: number) => {
    if (!chatId) return;
    lastByChat.set(chatId, { messageId: msgId, updatedAt: Date.now() });
  };

  const msg =
    ctx.callbackQuery && "message" in ctx.callbackQuery
      ? ctx.callbackQuery.message
      : undefined;
  if (chatId && msg && "message_id" in msg) {
    lastByChat.set(chatId, {
      messageId: (msg as any).message_id,
      updatedAt: Date.now(),
    });
  }

  return next();
};

export function getLastMessageId(chatId: number) {
  return lastByChat.get(chatId)?.messageId;
}
export function forgetChat(chatId: number) {
  lastByChat.delete(chatId);
}


