import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import type { ScreenPayload } from "./screens.js";
import { Types } from "mongoose";
import { AudioStory } from "../../db/models/AudioStory.js";
import { AudioPurchase } from "../../db/models/AudioPurchase.js";
import { getBalance } from "../../features/tokens/wallet.service.js";

export async function renderAudioStoryScreen(ctx: MyContext, audioStoryId: string): Promise<ScreenPayload> {
  const story = await AudioStory.findById(audioStoryId).lean();
  if (!story) {
    return {
      text: "История не найдена.",
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ Назад", "listen_stories")]]),
    };
  }

  const userId = (ctx.state.user as any)?._id as Types.ObjectId | undefined;
  if (!userId) {
    return {
      text: "Не удалось определить пользователя.",
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ В меню", "main")]]),
    };
  }

  const bought = await AudioPurchase.exists({ userId, audioStoryId: story._id });
  const balance = await getBalance(userId);
  const price = Math.max(0, Number((story as any).priceTokens ?? 0));

  const text = [
    `🎧 ${String((story as any).title).trim()}`,
    ``,
    `Цена: ${price} ключ(ей)`,
    `Баланс: ${balance} ключ(ей)`,
    bought ? `Статус: ✅ куплено` : `Статус: 🔒 не куплено`,
  ].join("\n");

  const rows = [];

  if (bought) {
    rows.push([Markup.button.callback("▶️ Слушать", `audio:play:${String(story._id)}`)]);
  } else {
    rows.push([Markup.button.callback(`Купить за ${price} ключ(ей)`, `audio:buy:${String(story._id)}`)]);
  }

  rows.push([Markup.button.callback("⬅️ Назад", `audio:close:${String(story._id)}`)]);

  return { text, inline: Markup.inlineKeyboard(rows) };
}
