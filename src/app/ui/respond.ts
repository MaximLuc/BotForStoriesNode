import { Markup } from "telegraf";
import type { MyContext } from "../../shared/types";
import type { UserDoc } from "../../db/models/User";
import { buildReplyMain } from "./menus";

function isCallback(ctx: MyContext) {
  return "callback_query" in ctx.update;
}

export async function safeEdit(
  ctx: MyContext,
  text: string,
  inline?: ReturnType<typeof Markup.inlineKeyboard>,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
) {
  const cbq = (p?: string) => ctx.answerCbQuery(p).catch(() => {});

  const msg: any =
    ctx.callbackQuery && "message" in ctx.callbackQuery
      ? (ctx.callbackQuery as any).message
      : undefined;

  const currentText = msg && "text" in msg ? msg.text : undefined;
  const currentMarkup = msg?.reply_markup;
  const newMarkup = inline?.reply_markup;

  if (
    currentText === text &&
    JSON.stringify(currentMarkup) === JSON.stringify(newMarkup)
  ) {
    await cbq();
    return;
  }

  try {
    await ctx.editMessageText(text, inline);
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

    const sent = await ctx.reply(text, inline);
    (ctx.state as any)?.rememberMessageId?.(sent.message_id);

    await cbq();
  }
}

export type RespondOpts = {
  inline?: any
  setReplyKeyboard?: any
  replyNoticeText?: string
  parseMode?: 'Markdown' | 'HTML'
}

export async function respond(ctx: MyContext, text: string, opts: RespondOpts = {}) {
  const kb = opts.inline ? (opts.inline.reply_markup ? opts.inline : { reply_markup: opts.inline }) : undefined
  const parse_mode = opts.parseMode ?? 'Markdown' 

  try {
    await ctx.editMessageText(text, { parse_mode, ...kb })
    return
  } catch {}

  const sent = await ctx.reply(text, { parse_mode, ...kb })
  ;(ctx.state as any)?.rememberMessageId?.(sent.message_id)

  if (opts.replyNoticeText) {
    try { await ctx.reply(opts.replyNoticeText) } catch {}
  }
}
