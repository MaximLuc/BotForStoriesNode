import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types";
import { Markup } from "telegraf";
import { Story } from "../../db/models/Story";
import {
  renderReadEndingScreen,
  userRank,
  paginateStory,
  makePagerRow,
} from "../../app/ui/screens.readStory";
import { openOrPage, chooseEnding, dropActiveSession } from "./reading.service";
import { navigate } from "../../app/ui/navigate";
import { forgetChat } from "../../app/middlewares/singleMessage";

type EndingLean = { _id: any; title?: string; text?: string; minRank?: number };
type StoryLean = {
  _id: any;
  title: string;
  text: string;
  endings: EndingLean[];
  isPublished: boolean;
  minRank?: number;
  coverUrl?: string | null;
};


function esc(s: string = ""): string {
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
  return !!(msg && msg.photo && Array.isArray(msg.photo) && msg.photo.length);
}

async function sendOrReplaceWithPhoto(
  ctx: MyContext,
  fileId: string,
  caption: string,
  inline?: any
) {
  const chatId = ctx.chat?.id;
  const msg: any =
    ctx.callbackQuery && "message" in (ctx.callbackQuery as any)
      ? (ctx.callbackQuery as any).message
      : undefined;
  if (chatId && msg && msg.message_id) {
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
    const photos = msg?.photo as any[] | undefined;
    const biggest =
      photos && photos.length ? photos[photos.length - 1] : undefined;
    const fileId = biggest?.file_id;
    if (fileId) {
      await sendOrReplaceWithPhoto(ctx, fileId, caption, inline);
    } else {
      await editOrReplyText(ctx, caption, inline);
    }
  }
}

async function editOrReplyText(ctx: MyContext, text: string, inline?: any) {
  try {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: inline?.reply_markup ?? inline,
    });
  } catch {
    const chatId = ctx.chat?.id;
    const msg: any =
      ctx.callbackQuery && "message" in (ctx.callbackQuery as any)
        ? (ctx.callbackQuery as any).message
        : undefined;
    if (chatId && msg && msg.message_id) {
      try {
        await ctx.telegram.deleteMessage(chatId, msg.message_id);
      } catch {}
    }
    const sent = await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: inline?.reply_markup ?? inline,
    });
    (ctx.state as any)?.rememberMessageId?.(sent.message_id);
  }
}

function buildStoryKeyboard(s: StoryLean, page: number, pages: number) {
  const rows: any[] = [];
  if (pages > 1) rows.push(makePagerRow(String(s._id), page, pages));

  if (page === pages - 1) {
    const ends = Array.isArray(s.endings) ? s.endings : [];
    if (ends.length) {
      for (let i = 0; i < ends.length; i += 2) {
        const A = ends[i];
        const B = ends[i + 1];
        const starA = (A?.minRank ?? 0) >= 1 ? "★ " : "";
        const starB = (B?.minRank ?? 0) >= 1 ? "★ " : "";
        const row: any[] = [
          Markup.button.callback(
            `${starA}${A?.title ?? `Вариант ${i + 1}`}`,
            `read:choose:${s._id}:${i}`
          ),
        ];
        if (B)
          row.push(
            Markup.button.callback(
              `${starB}${B?.title ?? `Вариант ${i + 2}`}`,
              `read:choose:${s._id}:${i + 1}`
            )
          );
        rows.push(row);
      }
    } else {
      rows.push([Markup.button.callback("Варианты отсутствуют", "noop")]);
    }
  }

  rows.push([Markup.button.callback("↩︎ К списку", `read:list_from:${s._id}`)]);
  return Markup.inlineKeyboard(rows);
}


export function registerReadHandlers(bot: Telegraf<MyContext>) {
  bot.action(/^story:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);

    await openOrPage(ctx, storyId, 0);

    const s = await Story.findById(storyId).lean<StoryLean>();
    if (!s || !s.isPublished) {
      return editOrReplyText(
        ctx,
        "История недоступна.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", "read_stories")],
        ])
      );
    }

    const ur = userRank(ctx);
    if ((s.minRank ?? 0) > ur) {
      return editOrReplyText(
        ctx,
        `★ Эта история доступна только подписчикам.\n\n<b>${esc(
          s.title
        )}</b>`,
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", "read_stories")],
        ])
      );
    }

    const coverId = extractFileId(s.coverUrl);
    const parts = paginateStory(s.text || "", !!coverId);
    const pages = Math.max(1, parts.length);
    const page = 0;

    const titleLine = `<b>${esc(s.title)}</b>${
      (s.minRank ?? 0) >= 1 ? "  ★" : ""
    }`;
    const header = pages > 1 ? `<i>(страница ${page + 1}/${pages})</i>\n\n` : "";
    const body = esc(parts[page] || "");
    const text = `${titleLine}\n\n${header}${body}`;

    const kb = buildStoryKeyboard(s, page, pages);

    if (coverId) {
      return sendOrReplaceWithPhoto(ctx, coverId, text, kb);
    } else {
      return editOrReplyText(ctx, text, kb);
    }
  });

  bot.action(/^read:story:([^:]+):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);
    let page = Number(ctx.match[2]);

    await openOrPage(ctx, storyId, page);

    const s = await Story.findById(storyId).lean<StoryLean>();
    if (!s || !s.isPublished) {
      return editOrReplyText(
        ctx,
        "История недоступна.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", "read_stories")],
        ])
      );
    }

    const coverId = extractFileId(s.coverUrl);
    const parts = paginateStory(s.text || "", !!coverId);
    const pages = Math.max(1, parts.length);
    if (page > pages - 1) page = pages - 1;
    if (page < 0) page = 0;

    const titleLine = `<b>${esc(s.title)}</b>${
      (s.minRank ?? 0) >= 1 ? "  ★" : ""
    }`;
    const header = pages > 1 ? `<i>(страница ${page + 1}/${pages})</i>\n\n` : "";
    const body = esc(parts[page] || "");
    const text = `${titleLine}\n\n${header}${body}`;

    const kb = buildStoryKeyboard(s, page, pages);

    const currentIsPhoto = isCurrentMessagePhoto(ctx);
    const needPhoto = page === 0 && !!coverId;

    if (needPhoto) {
      if (currentIsPhoto) return editPhotoCaption(ctx, text, kb);
      return sendOrReplaceWithPhoto(ctx, coverId!, text, kb);
    } else {
      return editOrReplyText(ctx, text, kb);
    }
  });

  bot.action(/^read:choose:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);
    const idx = Number(ctx.match[2]);

    await chooseEnding(ctx, storyId, idx);

    const s = await Story.findById(storyId).lean<StoryLean>();
    if (!s || !s.isPublished) {
      return editOrReplyText(
        ctx,
        "История недоступна.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", `read:list_from:${storyId}`)],
        ])
      );
    }

    const { text, inline } = await renderReadEndingScreen(ctx);
    const safe = esc(text);
    return editOrReplyText(ctx, safe, inline);
  });

  bot.action(/^read:end:([^:]+):(\d+):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const { text, inline } = await renderReadEndingScreen(ctx);
    const safe = esc(text);
    return editOrReplyText(ctx, safe, inline);
  });

  bot.action(/^read:list_from:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);

    await dropActiveSession(ctx, storyId);

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

  bot.action("subscribe", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrReplyText(
      ctx,
      "⭐ Подписка скоро будет доступна.\n\nОформите премиум, чтобы читать все концовки.",
      Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ К списку", "read_stories")],
      ])
    );
  });

  bot.action("noop", async (ctx) => ctx.answerCbQuery());
}
