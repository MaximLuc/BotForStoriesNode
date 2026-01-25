import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { Story } from "../../db/models/Story.js";
import {
  renderReadEndingScreen,
  paginateStory,
  makePagerRow,
} from "../../app/ui/screens.readStory.js";
import { openOrPage, chooseEnding, dropActiveSession } from "./reading.service.js";
import { navigate } from "../../app/ui/navigate.js";
import { safeEdit } from "../../app/ui/respond.js";
import { forgetChat } from "../../app/middlewares/singleMessage.js";
import { Types } from "mongoose";

type EndingLean = { _id: any; title?: string; text?: string; minRank?: number };
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
  return sent;
}

async function editPhotoCaption(ctx: MyContext, caption: string, inline?: any) {
  try {
    await ctx.editMessageCaption(caption, {
      parse_mode: "HTML",
      reply_markup: inline?.reply_markup ?? inline,
    });
  } catch (e) {
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
  await safeEdit(ctx, text, inline, "HTML");
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
  rows.push([Markup.button.callback("🏠 Главное меню", "main")]);
  return Markup.inlineKeyboard(rows);
}

async function renderAndShowStoryPage(ctx: MyContext, s: StoryLean, page: number) {
  const coverId = extractFileId(s.coverUrl);
  const parts = paginateStory(s.text || "", !!coverId);
  const pages = Math.max(1, parts.length);

  let p = page;
  if (p > pages - 1) p = pages - 1;
  if (p < 0) p = 0;

  const titleLine = `<b>${esc(s.title)}</b>`;
  const header = pages > 1 ? `<i>(страница ${p + 1}/${pages})</i>\n\n` : "";
  const body = esc(parts[p] || "");
  const text = `${titleLine}\n\n${header}${body}`;

  const kb = buildStoryKeyboard(s, p, pages);

  const currentIsPhoto = isCurrentMessagePhoto(ctx);
  const needPhoto = p === 0 && !!coverId;

  if (needPhoto) {
    if (currentIsPhoto) return editPhotoCaption(ctx, text, kb);
    return sendOrReplaceWithPhoto(ctx, coverId!, text, kb);
  }
  return editOrReplyText(ctx, text, kb);
}

async function ensureStoryAccessOrShowPay(ctx: MyContext, s: StoryLean): Promise<boolean> {
  const u = ctx.state.user as any;
  const userId = u?._id as Types.ObjectId | undefined;
  if (!userId) {
    await editOrReplyText(
      ctx,
      "Ошибка пользователя.",
      Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ К списку", "read_stories")],
        [Markup.button.callback("🏠 Главное меню", "main")],
      ])
    );
    return false;
  }

  const price = Math.max(0, Math.floor(Number(s.entryTokens ?? 0)));
  if (price <= 0) return true;

  const { hasStoryAccess } = await import("./storyAccess.service.js");
  const ok = await hasStoryAccess(userId, new Types.ObjectId(String(s._id)));

  if (ok) return true;

  const { renderBuyStoryConfirmScreen } = await import("../../app/ui/screens.buyStory.js");
  const scr = await renderBuyStoryConfirmScreen({
    ctx,
    storyId: String(s._id),
    title: s.title,
    price,
  });

  await editOrReplyText(ctx, scr.text, scr.inline);
  return false;
}

export function registerReadHandlers(bot: Telegraf<MyContext>) {
  bot.action(/^story:buy:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);

    const s = await Story.findById(storyId).lean<StoryLean>();
    if (!s || !s.isPublished) {
      return editOrReplyText(
        ctx,
        "История недоступна.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", "read_stories")],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }

    const u = ctx.state.user as any;
    const userId = u?._id as any;
    if (!userId) {
      return editOrReplyText(
        ctx,
        "Ошибка пользователя.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", "read_stories")],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }

    const price = Math.max(0, Math.floor(Number(s.entryTokens ?? 0)));
    if (price <= 0) {
      await openOrPage(ctx, storyId, 0);
      return renderAndShowStoryPage(ctx, s, 0);
    }

    const { tryBuyStoryAccess } = await import("./storyAccess.service.js");
    const res = await tryBuyStoryAccess({
      userId,
      tgId: ctx.from?.id,
      storyId,
      price,
    });

    if (!res.ok && res.reason === "no_balance") {
      return editOrReplyText(
        ctx,
        `😕 Недостаточно токенов.\n\nНужно: <b>${price}</b> токен(ов).`,
        Markup.inlineKeyboard([
          [Markup.button.callback("💰 Купить токены", "buy_tokens")],
          [Markup.button.callback("⬅️ Назад", "read_stories")],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }

    if (!res.ok) {
      return editOrReplyText(
        ctx,
        "⚠️ Не удалось открыть доступ. Попробуйте позже.",
        Markup.inlineKeyboard([
          [Markup.button.callback("⬅️ Назад", "read_stories")],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }

    await openOrPage(ctx, storyId, 0);
    const fresh = await Story.findById(storyId).lean<StoryLean>();
    return renderAndShowStoryPage(ctx, (fresh ?? s) as StoryLean, 0);
  });

  bot.action(/^story:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);

    const s = await Story.findById(storyId).lean<StoryLean>();
    if (!s || !s.isPublished) {
      return editOrReplyText(
        ctx,
        "История недоступна.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", "read_stories")],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }

    const ok = await ensureStoryAccessOrShowPay(ctx, s);
    if (!ok) return;

    await openOrPage(ctx, storyId, 0);
    return renderAndShowStoryPage(ctx, s, 0);
  });

  bot.action(/^read:story:([^:]+):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);
    const page = Number(ctx.match[2]);

    const s = await Story.findById(storyId).lean<StoryLean>();
    if (!s || !s.isPublished) {
      return editOrReplyText(
        ctx,
        "История недоступна.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", "read_stories")],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }

    const ok = await ensureStoryAccessOrShowPay(ctx, s);
    if (!ok) return;

    await openOrPage(ctx, storyId, page);
    return renderAndShowStoryPage(ctx, s, page);
  });

  bot.action(/^read:choose:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);
    const idx = Number(ctx.match[2]);

    const u = ctx.state.user as any;
    const userId = u?._id;
    const tgId = u?.tgId;

    const s = await Story.findById(storyId);
    if (!s || !s.isPublished) {
      return editOrReplyText(
        ctx,
        "История недоступна.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", `read:list_from:${storyId}`)],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }
    const ending = s.endings?.[idx];
    if (!ending) {
      return editOrReplyText(
        ctx,
        "Вариант недоступен.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ Назад", `story:${storyId}`)],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }
    if (!userId) {
      return editOrReplyText(
        ctx,
        "Ошибка пользователя.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ Назад", `story:${storyId}`)],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ])
      );
    }

    const { isAllPremium, hasAccessToEnding, tryLockFirstChoice } =
      await import("./endingChoice.service.js");

    const premiumAll = isAllPremium(ctx);
    if (premiumAll) {
      await chooseEnding(ctx, storyId, idx);
      const { text, inline } = await renderReadEndingScreen(ctx);
      return editOrReplyText(ctx, esc(text), inline);
    }

    const access = await hasAccessToEnding(ctx, userId, s._id, ending._id);
    if (access === "chosen" || access === "extra") {
      await chooseEnding(ctx, storyId, idx);
      const { text, inline } = await renderReadEndingScreen(ctx);
      return editOrReplyText(ctx, esc(text), inline);
    }

    const lockRes = await tryLockFirstChoice(userId as any, tgId, s._id, ending._id);
    if (lockRes === "lockedNow" || lockRes === "alreadySame") {
      await chooseEnding(ctx, storyId, idx);
      const { text, inline } = await renderReadEndingScreen(ctx);
      return editOrReplyText(ctx, esc(text), inline);
    }

    const { renderBuyEndingConfirmScreen } =
      await import("../../app/ui/screens.buyEnding.js");
    const scr = await renderBuyEndingConfirmScreen(ctx, storyId, idx, userId);
    return editOrReplyText(ctx, scr.text, scr.inline);
  });

  bot.action(/^read:end:([^:]+):(\d+):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const { text, inline } = await renderReadEndingScreen(ctx);
    return editOrReplyText(ctx, esc(text), inline);
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

  bot.action("noop", async (ctx) => ctx.answerCbQuery());
}
