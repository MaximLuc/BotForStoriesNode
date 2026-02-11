import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { Story } from "../../db/models/Story.js";
import {
  renderReadEndingScreen,
  paginateStory,
  makePagerRow,
} from "../../app/ui/screens.readStory.js";
import {
  openOrPage,
  chooseEnding,
  dropActiveSession,
} from "./reading.service.js";
import { navigate } from "../../app/ui/navigate.js";
import { safeEdit } from "../../app/ui/respond.js";
import { forgetChat } from "../../app/middlewares/singleMessage.js";
import { Types } from "mongoose";


type EndingLean = {
  _id: any;
  title?: string;
  text?: string;
  minRank?: number;
};

type StoryLean = {
  _id: any;
  title: string;
  text: string;
  endings: EndingLean[];
  entryTokens?: number;
  isPublished: boolean;
  minRank?: number;
  coverUrl?: string | null;
};


function esc(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractFileId(coverUrl?: string | null): string | null {
  if (!coverUrl) return null;
  const m = String(coverUrl).match(/^tg:(.+)$/);
  return m ? m[1] : null;
}

function isCurrentMessagePhoto(ctx: MyContext): boolean {
  const msg: any =
    ctx.callbackQuery && "message" in (ctx.callbackQuery as any)
      ? (ctx.callbackQuery as any).message
      : undefined;
  return !!(msg?.photo?.length);
}


async function sendOrReplaceWithPhoto(
  ctx: MyContext,
  fileId: string,
  caption: string,
  inline?: any,
) {
  const chatId = ctx.chat?.id;
  const msg: any =
    ctx.callbackQuery && "message" in (ctx.callbackQuery as any)
      ? (ctx.callbackQuery as any).message
      : undefined;

  if (chatId && msg?.message_id) {
    try {
      await ctx.telegram.deleteMessage(chatId, msg.message_id);
    } catch {}
  }

  const sent = await ctx.replyWithPhoto(fileId, {
    caption,
    parse_mode: "HTML",
    reply_markup: inline?.reply_markup ?? inline,
  });

  (ctx.state as any)?.rememberMessageId?.(sent.message_id);
  return sent;
}

async function editPhotoCaption(ctx: MyContext, caption: string, inline?: any) {
  try {
    await ctx.editMessageCaption(caption, {
      parse_mode: "HTML",
      reply_markup: inline?.reply_markup ?? inline,
    });
  } catch {
    const msg: any =
      ctx.callbackQuery && "message" in (ctx.callbackQuery as any)
        ? (ctx.callbackQuery as any).message
        : undefined;
    const fileId = msg?.photo?.[msg.photo.length - 1]?.file_id;
    if (fileId) {
      await sendOrReplaceWithPhoto(ctx, fileId, caption, inline);
    } else {
      await safeEdit(ctx, caption, inline, "HTML");
    }
  }
}


function truncateWithEllipsis(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function moveTrailingEmojiToFront(title: string) {
  const t = title.trim();
  const m = t.match(/([\p{Extended_Pictographic}\uFE0F\u200D]+)\s*$/u);
  if (!m) return { emoji: "", text: t };
  return {
    emoji: m[1],
    text: t.slice(0, t.length - m[0].length).trim(),
  };
}

function formatEndingButtonTitle(raw: string, max = 26) {
  const { emoji, text } = moveTrailingEmojiToFront(raw);
  const base = text || raw;
  const cut = truncateWithEllipsis(base, emoji ? max - 3 : max);
  return emoji ? `${emoji} ${cut}` : cut;
}


function buildStoryKeyboard(s: StoryLean, page: number, pages: number) {
  const rows: any[] = [];

  if (pages > 1) {
    rows.push(makePagerRow(String(s._id), page, pages));

    if (page < pages - 1) {
      rows.push([
        Markup.button.callback(
          "⏭ К выбору концовок",
          `read:to_end:${s._id}`,
        ),
      ]);
    }
  }

  if (page === pages - 1) {
    for (let i = 0; i < s.endings.length; i += 2) {
      const A = s.endings[i];
      const B = s.endings[i + 1];

      const row: any[] = [
        Markup.button.callback(
          esc(formatEndingButtonTitle(A.title ?? `Вариант ${i + 1}`)),
          `read:choose:${s._id}:${i}`,
        ),
      ];

      if (B) {
        row.push(
          Markup.button.callback(
            esc(formatEndingButtonTitle(B.title ?? `Вариант ${i + 2}`)),
            `read:choose:${s._id}:${i + 1}`,
          ),
        );
      }

      rows.push(row);
    }
  }

  rows.push([Markup.button.callback("↩︎ К списку", `read:list_from:${s._id}`)]);
  rows.push([Markup.button.callback("🏠 Главное меню", "main")]);

  return Markup.inlineKeyboard(rows);
}


async function renderAndShowStoryPage(
  ctx: MyContext,
  s: StoryLean,
  page: number,
) {
  const coverId = extractFileId(s.coverUrl);
  const parts = paginateStory(s.text || "", !!coverId);
  const pages = Math.max(1, parts.length);
  const p = Math.min(Math.max(page, 0), pages - 1);

  const header =
    pages > 1 ? `<i>(страница ${p + 1}/${pages})</i>\n\n` : "";

  const text = `<b>${esc(s.title)}</b>\n\n${header}${parts[p] || ""}`;
  const kb = buildStoryKeyboard(s, p, pages);

  if (p === 0 && coverId) {
    if (isCurrentMessagePhoto(ctx)) {
      return editPhotoCaption(ctx, text, kb);
    }
    return sendOrReplaceWithPhoto(ctx, coverId, text, kb);
  }

  return safeEdit(ctx, text, kb, "HTML");
}



export function registerReadHandlers(bot: Telegraf<MyContext>) {

  bot.action(/^story:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await Story.findById(ctx.match[1]).lean<StoryLean>();
    if (!s || !s.isPublished) return;
    await openOrPage(ctx, s._id, 0);
    return renderAndShowStoryPage(ctx, s, 0);
  });

  bot.action(/^read:story:([^:]+):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await Story.findById(ctx.match[1]).lean<StoryLean>();
    if (!s || !s.isPublished) return;
    await openOrPage(ctx, s._id, Number(ctx.match[2]));
    return renderAndShowStoryPage(ctx, s, Number(ctx.match[2]));
  });

  bot.action(/^read:to_end:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await Story.findById(ctx.match[1]).lean<StoryLean>();
    if (!s || !s.isPublished) return;
    const last = paginateStory(s.text || "", !!s.coverUrl).length - 1;
    await openOrPage(ctx, s._id, last);
    return renderAndShowStoryPage(ctx, s, last);
  });

  bot.action(/^read:choose:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await chooseEnding(ctx, ctx.match[1], Number(ctx.match[2]));
    const { text, inline } = await renderReadEndingScreen(ctx);
    return safeEdit(ctx, text, inline, "HTML");
  });

  bot.action(/^read:end:([^:]+):(\d+):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const { text, inline } = await renderReadEndingScreen(ctx);
    return safeEdit(ctx, text, inline, "HTML");
  });

  bot.action(/^read:list_from:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await dropActiveSession(ctx, ctx.match[1]);
    const chatId = ctx.chat?.id;
    const msg: any =
      ctx.callbackQuery && "message" in ctx.callbackQuery
        ? (ctx.callbackQuery as any).message
        : undefined;
    if (chatId && msg?.message_id) {
      try {
        await ctx.telegram.deleteMessage(chatId, msg.message_id);
      } catch {}
      forgetChat(chatId);
    }
    await navigate(ctx, "readStories" as any);
  });

  bot.action("noop", async (ctx) => ctx.answerCbQuery());
}
