import type { Telegraf } from "telegraf";
import { Types } from "mongoose";
import type { MyContext } from "../../shared/types.js";
import { respond } from "../../app/ui/respond.js";
import { AudioStory } from "../../db/models/AudioStory.js";
import { AudioPurchase } from "../../db/models/AudioPurchase.js";
import { spendTokens, getBalance } from "../tokens/wallet.service.js";
import { renderAudioStoryScreen } from "../../app/ui/screens.audioStory.js";
import { renderListenStoriesScreen } from "../../app/ui/screens.listenStories.js";

function minutesText(durationSec?: number) {
  const s = Math.max(0, Number(durationSec ?? 0));
  if (!s) return "—";
  return `${Math.ceil(s / 60)} мин`;
}

export function registerAudioHandlers(bot: Telegraf<MyContext>) {
  bot.action(/^audio:open:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = String((ctx.match as any)[1]);
    if (!Types.ObjectId.isValid(id)) return;

    await AudioStory.updateOne({ _id: id }, { $inc: { opensCount: 1 } });

    const payload = await renderAudioStoryScreen(ctx, id);
    await respond(ctx, payload.text, { inline: payload.inline });
  });

  bot.action(/^audio:close:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = String((ctx.match as any)[1]);

    if (Types.ObjectId.isValid(id)) {
      await AudioStory.updateOne({ _id: id }, { $inc: { closesCount: 1 } });
    }

    // ✅ сразу возвращаем список, без промежуточных сообщений
    const payload = await renderListenStoriesScreen(ctx);
    await respond(ctx, payload.text, { inline: payload.inline });
  });

  bot.action(/^audio:buy:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = String((ctx.match as any)[1]);
    if (!Types.ObjectId.isValid(id)) return;

    const user = ctx.state.user;
    const userId = (user as any)?._id as Types.ObjectId | undefined;
    const tgId = user?.tgId;
    if (!userId) return;

    const story = await AudioStory.findById(id).lean();
    if (!story) return;

    const already = await AudioPurchase.exists({ userId, audioStoryId: (story as any)._id });
    if (already) {
      const payload = await renderAudioStoryScreen(ctx, id);
      return respond(ctx, payload.text, { inline: payload.inline });
    }

    const price = Math.max(0, Number((story as any).priceTokens ?? 0));
    const ok = await spendTokens(userId, price);

    if (!ok) {
      const balance = await getBalance(userId);
      const text = `Недостаточно токенов.\nЦена: ${price}\nБаланс: ${balance}`;
      return respond(ctx, text, {
        inline: {
          inline_keyboard: [
            [{ text: "Купить токены", callback_data: "buy_tokens" }],
            [{ text: "⬅️ Назад", callback_data: `audio:open:${id}` }],
          ],
        },
      });
    }

    try {
      await AudioPurchase.create({
        userId,
        tgId,
        audioStoryId: (story as any)._id,
        paidTokens: price,
        paidAt: new Date(),
      });

      await AudioStory.updateOne({ _id: id }, { $inc: { tokensSpent: price } });
    } catch {
      // если гонка и запись уже есть — игнор
    }

    const payload = await renderAudioStoryScreen(ctx, id);
    return respond(ctx, payload.text, { inline: payload.inline });
  });

  bot.action(/^audio:play:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = String((ctx.match as any)[1]);
    if (!Types.ObjectId.isValid(id)) return;

    const userId = (ctx.state.user as any)?._id as Types.ObjectId | undefined;
    if (!userId) return;

    const story = await AudioStory.findById(id).lean();
    if (!story) return;

    const bought = await AudioPurchase.exists({ userId, audioStoryId: (story as any)._id });
    if (!bought) {
      const payload = await renderAudioStoryScreen(ctx, id);
      return respond(ctx, payload.text, { inline: payload.inline });
    }

    // ✅ удаляем "экран" с кнопкой "Слушать", чтобы не было мусора
    try {
      await ctx.deleteMessage();
    } catch {}

    const caption =
      `🎧 <b>${String((story as any).title)}</b>\n` +
      `Цена: ${Number((story as any).priceTokens ?? 0)} ток.\n` +
      `Длина: ${minutesText((story as any).durationSec)}\n\n` +
      `⬅️ Вернуться — кнопкой ниже`;

    const sent = await ctx.replyWithVoice(String((story as any).audioId), {
      caption,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "⬅️ К списку", callback_data: `audio:close:${id}` }]],
      },
    });

    // ✅ закон одного окна: считаем voice текущим "главным"
    ctx.state?.rememberMessageId?.(sent.message_id);
  });
}
