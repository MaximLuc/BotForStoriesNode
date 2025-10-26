import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { Story } from "../../db/models/Story.js";
import { isAdmin } from "../../shared/utils.js";
import { safeEdit } from "../../app/ui/respond.js";
import { logTelegramError } from "../../shared/logger.js";

import {
  setPendingCover,
  getPendingCover,
  clearPendingCover,
} from "../stories/cover.state.js";

type StoryLean = {
  _id: any;
  title: string;
  text: string;
  endings: { title?: string }[];
  minRank?: number;
  coverUrl?: string | null;
};

const PAGE_SIZE = 10;
  const backPageByUser = new Map<number, number>();

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function hasCover(s: StoryLean) {
  return !!(s.coverUrl && /^tg:/.test(String(s.coverUrl)));
}

function previewIntro(s: string, n = 90) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

async function renderCoverList(ctx: MyContext, page = 0) {
  const total = await Story.countDocuments({});
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages - 1) page = pages - 1;

  const items = await Story.find({})
    .sort({ createdAt: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean<StoryLean[]>();

  const head = `*Обложки историй*\n_Стр. ${page + 1}/${pages}_\n\n`;
  const lines =
    items
      .map((s) => {
        const ico = hasCover(s) ? "🖼" : "◻️";
        const ends = (s.endings ?? []).length;
        return `${ico} ${s.title} (${ends})`;
      })
      .join("\n") || "_Пока нет историй_";

  const buttons = items.map((s) => {
    const lbl = hasCover(s) ? `🔄 ${s.title}` : `➕ ${s.title}`;
    return Markup.button.callback(lbl, `admin:cover:open:${s._id}:p:${page}`);
  });
  const grid = chunk(buttons, 2) as any[];

  const kb = Markup.inlineKeyboard([
    ...grid,
    [
      Markup.button.callback(
        "⟨ Назад",
        `admin:cover_list:p:${Math.max(0, page - 1)}`
      ),
      Markup.button.callback(`Стр. ${page + 1}/${pages}`, "noop"),
      Markup.button.callback(
        "Вперёд ⟩",
        `admin:cover_list:p:${Math.min(pages - 1, page + 1)}`
      ),
    ],
    [Markup.button.callback("↩︎ В админ-меню", "admin")],
  ]);

  return safeEdit(ctx, head + lines, kb);
}

async function renderAskCover(
  ctx: MyContext,
  storyId: string,
  backPage: number
) {
  const s = await Story.findById(storyId).lean<StoryLean>();
  if (!s) return renderCoverList(ctx, backPage);

  const ico = hasCover(s) ? "🖼 текущая есть" : "◻️ пока нет";
  const intro = previewIntro(s.text || "");
  const txt = `*${s.title}*
Статус: ${ico}

Отправьте *изображение* как фото или документ (jpeg/png/webp).
Начало: _${intro}_`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "↩︎ Назад к списку",
        `admin:cover_list:p:${backPage}`
      ),
    ],
  ]);

  await safeEdit(ctx, txt, kb);

  const tgId = ctx.state.user!.tgId;
  setPendingCover(tgId, storyId);
  backPageByUser.set(tgId, backPage);
}

async function afterSaveOrFail(ctx: MyContext, text: string, tgId: number) {
  const back = backPageByUser.get(tgId) ?? 0;
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback("↩︎ К списку", `admin:cover_list:p:${back}`)],
  ]);
  await safeEdit(ctx, text, kb);
  await renderCoverList(ctx, back);
}

export function registerAdminCoverHandlers(bot: Telegraf<MyContext>) {
  bot.action("admin:cover_list", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.user || !isAdmin(ctx.state.user)) {
      return safeEdit(
        ctx,
        "Доступ только для админа.",
        Markup.inlineKeyboard([[Markup.button.callback("↩︎ Назад", "main")]])
      );
    }
    return renderCoverList(ctx, 0);
  });

  bot.action(/^admin:cover_list:p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const page = Number(ctx.match[1]);
    return renderCoverList(ctx, page);
  });

  bot.action(/^admin:cover:open:([a-fA-F0-9]{24}):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);
    const backPage = Number(ctx.match[2]);
    return renderAskCover(ctx, storyId, backPage);
  });

  bot.on("message", async (ctx, next) => {
    const u = ctx.state.user;
    if (!u || !isAdmin(u)) return next();

    const storyId = getPendingCover(u.tgId);
    if (!storyId) return next();

    const m: any = ctx.message;
    const hasPhoto = Array.isArray(m?.photo) && m.photo.length;
    const isImageDoc =
      m?.document &&
      /^image\/(jpe?g|png|webp)$/i.test(String(m.document.mime_type || ""));

    if (!hasPhoto && !isImageDoc) return next();

    const fileId = hasPhoto
      ? m.photo[m.photo.length - 1].file_id
      : m.document.file_id;
    const msgId = m?.message_id;

  const tryDelete = async () => {
      if (!ctx.chat?.id || !msgId) return;
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, msgId);
      } catch (e) { logTelegramError("adminCover.deleteUserMsg", e, { chatId: ctx.chat?.id, msgId }) }
    };

    try {
      await Story.updateOne(
        { _id: storyId },
        { $set: { coverUrl: `tg:${fileId}` } }
      );
      clearPendingCover(u.tgId);
      await tryDelete();
      await afterSaveOrFail(ctx, "✅ Обложка сохранена.", u.tgId);
    } catch (e) {
      clearPendingCover(u.tgId);
      await tryDelete();
      await afterSaveOrFail(
        ctx,
        "❌ Не удалось сохранить обложку. Повторите позже.",
        u.tgId
      );
    }
  });

  bot.action("noop", async (ctx) => ctx.answerCbQuery());
}
