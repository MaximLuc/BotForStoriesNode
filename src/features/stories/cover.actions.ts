import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types";
import { Markup } from "telegraf";
import { Story } from "../../db/models/Story";
import { getLastMessageId } from "../../app/middlewares/singleMessage";
import {
  setPendingCover,
  getPendingCover,
  clearPendingCover,
} from "./cover.state";

async function updateMenu(ctx: MyContext, text: string, inline?: any) {
  const kb = inline
    ? inline.reply_markup
      ? inline
      : { reply_markup: inline }
    : undefined;

  if (ctx.callbackQuery && "message" in ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", ...kb });
      return;
    } catch {
    }
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
      } catch {
      }
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
      "🖼 Отправьте *изображение* (jpeg/png/webp) **как фото**. Документами не принимаем.",
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
    await ctx.answerCbQuery();
    const storyId = String(ctx.match[1]);

    try {
      await Story.updateOne({ _id: storyId }, { $unset: { coverUrl: 1 } });
      clearPendingCover(ctx.state.user!.tgId);

      await updateMenu(
        ctx,
        "✅ Обложка удалена.",
        Markup.inlineKeyboard([
          [{ text: "➕ Добавить обложку", callback_data: `cover:add:${storyId}` }],
          [{ text: "⬅️ В админ-меню", callback_data: "admin" }],
        ])
      );
    } catch {
      await updateMenu(
        ctx,
        "❌ Ошибка при удалении обложки.",
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
    const msgId: number | undefined = m?.message_id;

    const hasPhoto = Array.isArray(m?.photo) && m.photo.length > 0;
    const isDocument = !!m?.document;

    const deleteUserMsg = async () => {
      if (!msgId) return;
      try {
        await ctx.deleteMessage(msgId);
      } catch {}
    };

    if (isDocument && !hasPhoto) {
      await deleteUserMsg();
      await updateMenu(
        ctx,
        "⚠️ Пришлите изображение *как фото*, не файлом.",
        Markup.inlineKeyboard([
          [{ text: "⬅️ Отмена", callback_data: "cover:cancel" }],
        ])
      );
      return;
    }

    if (!hasPhoto) {
      return next();
    }

    const fileId: string = m.photo[m.photo.length - 1].file_id;

    try {
      await Story.updateOne(
        { _id: storyId },
        { $set: { coverUrl: `tg:${fileId}` } }
      );

      clearPendingCover(tgId);
      await deleteUserMsg();

      await updateMenu(
        ctx,
        "✅ Обложка сохранена!",
        Markup.inlineKeyboard([
          [{ text: "🗑 Удалить обложку", callback_data: `cover:delete:${storyId}` }],
          [{ text: "⬅️ В админ-меню", callback_data: "admin" }],
        ])
      );
    } catch {
      await deleteUserMsg();
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
