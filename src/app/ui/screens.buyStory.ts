import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";

export async function renderBuyStoryConfirmScreen(params: {
  ctx: MyContext;
  storyId: string;
  title: string;
  price: number;
}) {
  const { storyId, title, price } = params;

  const text =
    `🔒 <b>Доступ к истории</b>\n\n` +
    `История: <b>${escapeHtml(title)}</b>\n` +
    `Цена: <b>${price}</b> ключ(ей)\n\n` +
    `Нажмите «Открыть», чтобы списать ключи и начать чтение.`;

  const inline = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Открыть", `story:buy:${storyId}`)],
    [Markup.button.callback("⬅️ Назад", "read_stories")],
    [Markup.button.callback("🏠 Главное меню", "main")],
  ]);

  return { text, inline };
}

function escapeHtml(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
