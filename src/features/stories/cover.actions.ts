import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types";
import { Markup } from "telegraf";
import { Story } from "../../db/models/Story";
import { getLastMessageId } from "../../app/middlewares/singleMessage";
import {
  setPendingCover,
  getPendingCover,
  clearPendingCover,
  sweepPendingCovers,
} from "./cover.state";

async function updateMenu(ctx: MyContext, text: string, inline?: any) {
  const kb = inline
    ? inline.reply_markup
      ? inline
      : { reply_markup: inline }
    : undefined;
  if (ctx.callbackQuery && "message" in ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "Markdown", ...kb });
    return;
  }
  const chatId = ctx.chat?.id;
  if (chatId) {
    const lastId = getLastMessageId(chatId);
    if (lastId) {
      try {
        await ctx.telegram.editMessageText(chatId, lastId, undefined, text, {
          parse_mode: "Markdown",
          ...kb,
        });
        return;
      } catch {}
    }
  }
  const sent = await ctx.reply(text, { parse_mode: "Markdown", ...kb });
  (ctx.state as any)?.rememberMessageId?.(sent.message_id);
}

export function registerCoverActions(bot: Telegraf<MyContext>) {
  bot.action(/^cover:add:(.+)$/, async (ctx) => {
    const storyId = String(ctx.match[1]);
    setPendingCover(ctx.state.user!.tgId, storyId);
    await ctx.answerCbQuery();
    await updateMenu(
      ctx,
      "🖼 Отправьте *изображение* как фото или документ (jpeg/png/webp).",
      Markup.inlineKeyboard([
        [{ text: "⬅️ Отмена", callback_data: "cover:cancel" }],
      ])
    );
  });

  bot.action("cover:cancel", async (ctx) => {
    clearPendingCover(ctx.state.user!.tgId);
    await ctx.answerCbQuery("Отменено");
    await updateMenu(
      ctx,
      "Загрузка обложки отменена.",
      Markup.inlineKeyboard([
        [{ text: "⬅️ В админ-меню", callback_data: "admin" }],
      ])
    );
  });

  bot.action(/^cover:delete:(.+)$/, async (ctx) => {
    const storyId = String(ctx.match[1]);
    await ctx.answerCbQuery("Удаление...");

    try {
      await Story.updateOne({ _id: storyId }, { $unset: { coverUrl: 1 } });
      if (ctx.state.user?.tgId) clearPendingCover(ctx.state.user.tgId);

      await updateMenu(
        ctx,
        "✅ Обложка удалена.",
        Markup.inlineKeyboard([
          [{ text: "⬅️ В админ-меню", callback_data: "admin" }],
          [
            {
              text: "➕ Обновить обложку",
              callback_data: `cover:add:${storyId}`,
            },
          ],
        ])
      );
    } catch (e) {
      await updateMenu(
        ctx,
        "❌ Не удалось удалить обложку. Попробуйте через меню админа.",
        Markup.inlineKeyboard([
          [{ text: "⬅️ В админ-меню", callback_data: "admin" }],
        ])
      );
    }
  });

  bot.on("message", async (ctx, next) => {
    const tgId = ctx.state.user?.tgId;
    if (!tgId) return next();

    const storyId = getPendingCover(tgId);
    if (!storyId) return next();

    const m: any = ctx.message;
    const hasPhoto = Array.isArray(m?.photo) && m.photo.length;
    const isImageDoc =
      m?.document &&
      /^image\/(jpeg|jpg|png|webp)$/i.test(String(m.document.mime_type || ""));

    if (!hasPhoto && !isImageDoc) return next();

    const msgId = m?.message_id;
    const fileId = hasPhoto
      ? m.photo[m.photo.length - 1].file_id
      : m.document.file_id;

    const tryDelete = async () => {
      if (msgId)
        try {
          await ctx.deleteMessage(msgId);
        } catch {}
    };

    try {
      await Story.updateOne(
        { _id: storyId },
        { $set: { coverUrl: `tg:${fileId}` } }
      );
      clearPendingCover(tgId);
      await tryDelete();
      await updateMenu(
        ctx,
        "✅ Обложка сохранена.",
        Markup.inlineKeyboard([
          [{ text: "⬅️ В админ-меню", callback_data: "admin" }],
          [
            {
              text: "🗑 Удалить обложку",
              callback_data: `cover:delete:${storyId}`,
            },
          ],
        ])
      );
    } catch {
      await tryDelete();
      await updateMenu(
        ctx,
        "❌ Не удалось сохранить обложку. Попробуйте ещё раз.",
        Markup.inlineKeyboard([
          [{ text: "⬅️ Отмена", callback_data: "cover:cancel" }],
        ])
      );
    }
  });
}
