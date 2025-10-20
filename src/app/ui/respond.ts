import { Markup } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import type { MyContext } from "../../shared/types.js";

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
  const cbq = (p?: string) => ctx.answerCbQuery(p).catch(() => {});
  const msg: any =
    ctx.callbackQuery && "message" in ctx.callbackQuery
      ? (ctx.callbackQuery as any).message
      : undefined;

  const currentText = msg && "text" in msg ? msg.text : undefined;
  const currentMarkup = msg?.reply_markup;
  const { reply_markup } = normalizeInline(inline);

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
    const descr: string = e?.response?.description || "";
    if (/message is not modified/i.test(descr)) {
      await cbq();
      return;
    }
    const isNoText = /no text in the message to edit/i.test(descr);
    const notFound = /message to edit not found/i.test(descr);
    const cantEdit =
      /message can't be edited/i.test(descr) || /can't be edited/i.test(descr);

    if (!(isNoText || notFound || cantEdit)) {
      throw e;
    }
    const chatId = ctx.chat?.id;
    const messageId = msg?.message_id;
    if (chatId && messageId) {
      try {
        await ctx.telegram.deleteMessage(chatId, messageId);
      } catch {}
    }
    const sent = await ctx.reply(text, { parse_mode: parseMode, reply_markup });
    (ctx.state as any)?.rememberMessageId?.(sent.message_id);
    await cbq();
  }
}

export type RespondOpts = {
  inline?: ReturnType<typeof Markup.inlineKeyboard> | InlineKeyboardMarkup;
  setReplyKeyboard?: any;
  replyNoticeText?: string;
  parseMode?: "Markdown" | "HTML";
};

export async function respond(
  ctx: MyContext,
  text: string,
  opts: RespondOpts = {}
) {
  const { reply_markup } = normalizeInline(opts.inline);
  const parse_mode = opts.parseMode ?? "Markdown";

  try {
    await ctx.editMessageText(text, { parse_mode, reply_markup });
    return;
  } catch {}

  const sent = await ctx.reply(text, { parse_mode, reply_markup });
  (ctx.state as any)?.rememberMessageId?.(sent.message_id);

  if (opts.replyNoticeText) {
    try {
      await ctx.reply(opts.replyNoticeText);
    } catch {}
  }
}
