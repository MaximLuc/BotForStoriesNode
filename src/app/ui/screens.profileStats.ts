import { Markup } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { getUserProfileStats } from "../../features/stats/userStats.service.js";

export async function renderProfileUserStatsScreen(ctx: MyContext) {
  const u = ctx.state.user as any;
  const userId = u?._id;
  const tgId = u?.tgId;

  if (!userId) {
    return {
      text: "Профиль недоступен.",
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("🏠 На главную", "main")],
      ]),
    };
  }

  const s = await getUserProfileStats({ userId, tgId });

  const text = `
<b>📊 Твоя статистика</b>

<b>🗝 Ключи</b>
Баланс: <b>${s.keys.balance}</b>
Потрачено на вход в истории: <b>${s.keys.spentOnStories}</b>
Потрачено на ГС-истории: <b>${s.keys.spentOnAudio}</b>
Всего потрачено: <b>${s.keys.spentTotal}</b>

<b>📚 Текстовые истории</b>
Сессий чтения (открытий): <b>${s.reading.sessionsTotal}</b>
Уникальных историй открыто: <b>${s.reading.uniqueStoriesOpened}</b>
Дочитал до конца: <b>${s.reading.completedSessions}</b>
Бросил: <b>${s.reading.droppedSessions}</b>

<b>🎭 Концовки</b>
Открыто концовок за ключи: <b>${s.endings.purchases}</b>

<b>🎧 ГС-истории</b>
Куплено ГС-историй: <b>${s.audio.purchases}</b>
`.trim();

  return {
    text,
    inline: Markup.inlineKeyboard([
      [Markup.button.callback("↩︎ В профиль", "profile")],
      [Markup.button.callback("🏠 На главную", "main")],
    ]),
    parseMode: "HTML" as const,
  };
}
