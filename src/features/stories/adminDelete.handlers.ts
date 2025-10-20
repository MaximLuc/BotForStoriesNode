import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { Story } from "../../db/models/Story.js";
import { isAdmin } from "../../shared/utils.js";
import { safeEdit } from "../../app/ui/respond.js";

type EndingLean = { title?: string; text?: string };
type StoryLean = {
  _id: any;
  title: string;
  text: string;
  endings: EndingLean[];
  isPublished: boolean;
  minRank?: number;
  coverUrl?: string | null;
};

const PAGE_SIZE = 10;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function previewSentence(s: string, max = 120) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

function extractFileId(coverUrl?: string | null): string | null {
  if (!coverUrl) return null;
  const m = String(coverUrl).match(/^tg:(.+)$/);
  return m ? m[1] : null;
}

async function showPhotoOneWindow(
  ctx: MyContext,
  fileId: string,
  caption: string,
  inline?: ReturnType<typeof Markup.inlineKeyboard>
) {
  const kb = inline?.reply_markup
    ? inline
    : inline
    ? { reply_markup: inline.reply_markup ?? (inline as any) }
    : undefined;
  const src: any =
    ctx.callbackQuery && "message" in (ctx.callbackQuery as any)
      ? (ctx.callbackQuery as any).message
      : undefined;

  const isPhoto = !!(src && Array.isArray(src.photo) && src.photo.length);
  if (isPhoto) {
    try {
      await ctx.editMessageCaption(caption, {
        parse_mode: "Markdown",
        ...(kb ?? {}),
      });
      return;
    } catch {
      try {
        await ctx.telegram.deleteMessage(src.chat.id, src.message_id);
      } catch {}
      const sent = await ctx.replyWithPhoto(fileId, {
        caption,
        parse_mode: "Markdown",
        ...(kb ?? {}),
      });
      (ctx.state as any)?.rememberMessageId?.(sent.message_id);
      return;
    }
  } else {
    if (src?.chat?.id && src?.message_id) {
      try {
        await ctx.telegram.deleteMessage(src.chat.id, src.message_id);
      } catch {}
    }
    const sent = await ctx.replyWithPhoto(fileId, {
      caption,
      parse_mode: "Markdown",
      ...(kb ?? {}),
    });
    (ctx.state as any)?.rememberMessageId?.(sent.message_id);
    return;
  }
}

async function deleteStoryWithStats(storyId: string) {
  await Story.deleteOne({ _id: storyId }).exec();
}

async function renderDeleteList(ctx: MyContext, page = 0) {
  const total = await Story.countDocuments({});
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages - 1) page = pages - 1;

  const items = await Story.find({})
    .sort({ createdAt: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean<StoryLean[]>();

  const header = `*Удаление историй*\n_Стр. ${page + 1}/${pages}_\n\n`;
  const lines =
    items.map((s) => `• ${s.title} (${(s.endings ?? []).length})`).join("\n") ||
    "_Пока пусто_";

  const rowButtons = items.map((s) =>
    Markup.button.callback(`${s.title}`, `admin:delete:open:${s._id}:p:${page}`)
  );
  const grid = chunk(rowButtons, 2).map((r) => r as any[]);

  const kb = Markup.inlineKeyboard([
    ...grid,
    [
      Markup.button.callback(
        "⟨ Назад",
        `admin:delete_list:p:${Math.max(0, page - 1)}`
      ),
      Markup.button.callback(`Стр. ${page + 1}/${pages}`, "noop"),
      Markup.button.callback(
        "Вперёд ⟩",
        `admin:delete_list:p:${Math.min(pages - 1, page + 1)}`
      ),
    ],
    [Markup.button.callback("↩︎ В админ-меню", "admin")],
  ]);

  return safeEdit(ctx, header + lines, kb);
}

async function renderStoryCard(
  ctx: MyContext,
  storyId: string,
  backPage: number
) {
  const s = await Story.findById(storyId).lean<StoryLean>();
  if (!s) {
    return safeEdit(
      ctx,
      "История не найдена.",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "↩︎ Назад к списку",
            `admin:delete_list:p:${backPage}`
          ),
        ],
      ])
    );
  }

  const endingsCount = (s.endings ?? []).length;
  const endingsNames =
    (s.endings ?? [])
      .map((e, i) => `#${i + 1}: ${e.title || "—"}`)
      .join("; ") || "—";
  const intro = previewSentence(s.text || "");
  const star = (s.minRank ?? 0) >= 1 ? " ★" : "";
  const caption = `*${s.title}*${star}
_Окончаний:_ ${endingsCount}

*Начало:* ${intro}
*Продолжения:* ${endingsNames}

Выберите действие ниже.`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "🗑 Удалить историю",
        `admin:ask_delete:${s._id}:p:${backPage}`
      ),
    ],
    [
      Markup.button.callback(
        "↩︎ Назад к списку",
        `admin:delete_list:p:${backPage}`
      ),
    ],
    [Markup.button.callback("↩︎ В админ-меню", "admin")],
  ]);

  const fileId = extractFileId(s.coverUrl);
  if (fileId) return showPhotoOneWindow(ctx, fileId, caption, kb);
  return safeEdit(ctx, caption, kb);
}

export function registerAdminDeleteHandlers(bot: Telegraf<MyContext>) {
  bot.action("admin:delete_list", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.user || !isAdmin(ctx.state.user)) {
      return safeEdit(
        ctx,
        "Доступ только для админа.",
        Markup.inlineKeyboard([[Markup.button.callback("↩︎ Назад", "main")]])
      );
    }
    return renderDeleteList(ctx, 0);
  });

  bot.action(/^admin:delete_list:p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const page = Number(ctx.match[1]);
    return renderDeleteList(ctx, page);
  });

  bot.action(/^admin:delete:open:([a-fA-F0-9]{24}):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = String(ctx.match[1]);
    const backPage = Number(ctx.match[2]);
    return renderStoryCard(ctx, id, backPage);
  });

  bot.action(/^admin:ask_delete:([a-fA-F0-9]{24}):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = String(ctx.match[1]);
    const backPage = Number(ctx.match[2]);
    const s = await Story.findById(id).lean<{ title?: string }>();
    if (!s) return renderDeleteList(ctx, backPage);

    const kb = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "❌ Да, удалить",
          `admin:confirm_delete:${id}:p:${backPage}`
        ),
        Markup.button.callback(
          "↩︎ Назад",
          `admin:delete:open:${id}:p:${backPage}`
        ),
      ],
    ]);
    return safeEdit(
      ctx,
      `⚠️ Точно удалить *${s.title}*? Это действие необратимо.`,
      kb
    );
  });

  bot.action(
    /^admin:confirm_delete:([a-fA-F0-9]{24}):p:(\d+)$/,
    async (ctx) => {
      await ctx.answerCbQuery();
      const id = String(ctx.match[1]);
      const backPage = Number(ctx.match[2]);

      const s = await Story.findById(id).lean<{ title?: string }>();
      if (!s) return renderDeleteList(ctx, backPage);

      try {
        await deleteStoryWithStats(id);
        await safeEdit(
          ctx,
          `✅ История *${s.title}* удалена.`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "↩︎ К списку",
                `admin:delete_list:p:${backPage}`
              ),
            ],
          ])
        );
        return renderDeleteList(ctx, backPage);
      } catch (e) {
        console.error("[admin:confirm_delete] fail", e);
        return safeEdit(
          ctx,
          "❌ Не удалось удалить историю. Попробуйте позже.",
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "↩︎ К списку",
                `admin:delete_list:p:${backPage}`
              ),
            ],
          ])
        );
      }
    }
  );

  bot.action("noop", async (ctx) => ctx.answerCbQuery());
}
