import { Markup } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import type { MyContext } from "../../shared/types.js";
import { deletePrevMenuIfExists, saveMenuAnchor } from "../uiAnchor.js"; 
import { isCallbackMessageStale } from "../middlewares/staleGuard.js";
import { logTelegramError } from "../../shared/logger.js";

function normalizeInline(
  inline?: ReturnType<typeof Markup.inlineKeyboard> | InlineKeyboardMarkup
): { reply_markup?: InlineKeyboardMarkup } {
  if (!inline) return {};
  if ("reply_markup" in inline && inline.reply_markup) {
    return { reply_markup: inline.reply_markup as InlineKeyboardMarkup };
  }
  return { reply_markup: inline as InlineKeyboardMarkup };
}

export async function safeEdit(
  ctx: MyContext,
  text: string,
  inline?: ReturnType<typeof Markup.inlineKeyboard> | InlineKeyboardMarkup,
  parseMode: "Markdown" | "HTML" = "Markdown"
) {
  const cbq = async (p?: string) => {
    if (ctx.callbackQuery) {
      try { await ctx.answerCbQuery(p); } catch {}
    }
  };
  const msg: any =
    ctx.callbackQuery && "message" in ctx.callbackQuery
      ? (ctx.callbackQuery as any).message
      : undefined;

  const { reply_markup } = normalizeInline(inline);

  const mustReply =
    Boolean((ctx.state as any)?.forceReply) ||
    (ctx.callbackQuery ? isCallbackMessageStale(ctx) : false);

  if (mustReply) {
    await deletePrevMenuIfExists(ctx).catch(() => {});
    if (msg?.chat?.id && msg?.message_id) {
      try { await ctx.telegram.deleteMessage(msg.chat.id, msg.message_id); } catch (e) { logTelegramError("respond.safeEdit.delete-before-reply", e); }
    }
    const sent = await ctx.reply(text, { parse_mode: parseMode, reply_markup });
    await saveMenuAnchor(ctx, sent.message_id);
    (ctx.state as any)?.rememberMessageId?.(sent.message_id);
    await cbq();
    return;
  }

  const currentText = msg && "text" in msg ? msg.text : undefined;
  const currentMarkup = msg?.reply_markup;

  if (
    currentText === text &&
    JSON.stringify(currentMarkup) === JSON.stringify(reply_markup)
  ) {
    await cbq();
    return;
  }

  try {
    await ctx.editMessageText(text, { parse_mode: parseMode, reply_markup });
    await cbq();
    return;
  } catch (e: any) {
    logTelegramError("respond.safeEdit.editMessageText", e);
    const descr: string = e?.response?.description || "";
    const isNoText = /no text in the message to edit/i.test(descr);
    const notFound = /message to edit not found/i.test(descr);
    const cantEdit =
      /message can't be edited/i.test(descr) || /can't be edited/i.test(descr);

    if (!(isNoText || notFound || cantEdit)) {
      throw e;
    }

    await deletePrevMenuIfExists(ctx).catch(() => {});
    if (msg?.chat?.id && msg?.message_id) {
      try { await ctx.telegram.deleteMessage(msg.chat.id, msg.message_id); } catch (e2) { logTelegramError("respond.safeEdit.delete-fallback", e2); }
    }

    const sent = await ctx.reply(text, { parse_mode: parseMode, reply_markup });
    await saveMenuAnchor(ctx, sent.message_id);
    (ctx.state as any)?.rememberMessageId?.(sent.message_id);
    await cbq();
  }
}

type RespondOpts = {
  inline?: ReturnType<typeof Markup.inlineKeyboard> | InlineKeyboardMarkup;
  setReplyKeyboard?: any;
  replyNoticeText?: string;
  parseMode?: "Markdown" | "HTML";
  linkPreviewOptions?: any;
};

export async function respond(
  ctx: MyContext,
  text: string,
  opts: RespondOpts = {}
) {
  const { reply_markup } = normalizeInline(opts.inline);
  const parse_mode = opts.parseMode ?? "Markdown";
  const link_preview_options = opts.linkPreviewOptions;

  const msg: any =
    ctx.callbackQuery && "message" in ctx.callbackQuery
      ? (ctx.callbackQuery as any).message
      : undefined;

  const hasCbMessage = Boolean(ctx.callbackQuery && "message" in ctx.callbackQuery);

  const mustReply =
    Boolean((ctx.state as any)?.forceReply) ||
    (ctx.callbackQuery ? isCallbackMessageStale(ctx) : false);

  if (!mustReply && hasCbMessage) {
    try {
      await ctx.editMessageText(text, { parse_mode, reply_markup, ...(link_preview_options ? { link_preview_options } : {}) });
      try { await ctx.answerCbQuery(); } catch {}
      return;
    } catch (e) {
      logTelegramError("respond.respond.editMessageText", e);
      await deletePrevMenuIfExists(ctx).catch(() => {});
      if (msg?.chat?.id && msg?.message_id) {
        try { await ctx.telegram.deleteMessage(msg.chat.id, msg.message_id); } catch (e2) { logTelegramError("respond.respond.delete-fallback", e2); }
      }
      const sent = await ctx.reply(text, { parse_mode, reply_markup, ...(link_preview_options ? { link_preview_options } : {}) });
      await saveMenuAnchor(ctx, sent.message_id);
      (ctx.state as any)?.rememberMessageId?.(sent.message_id);
      try { await ctx.answerCbQuery(); } catch {}
      if (opts.replyNoticeText) {
        try { await ctx.reply(opts.replyNoticeText); } catch (e3) { logTelegramError("respond.respond.replyNotice", e3); }
      }
      return;
    }
  }

  await deletePrevMenuIfExists(ctx).catch(() => {});
  if (mustReply && msg?.chat?.id && msg?.message_id) {
    try { await ctx.telegram.deleteMessage(msg.chat.id, msg.message_id); } catch (e) { logTelegramError("respond.respond.delete-before-reply", e); }
  }

  const sent = await ctx.reply(text, { parse_mode, reply_markup, ...(link_preview_options ? { link_preview_options } : {}) });
  await saveMenuAnchor(ctx, sent.message_id);
  (ctx.state as any)?.rememberMessageId?.(sent.message_id);

  if (opts.replyNoticeText) {
    try { await ctx.reply(opts.replyNoticeText); } catch (e) { logTelegramError("respond.respond.replyNotice", e); }
  }
}
