import type { InlineKeyboardMarkup } from "telegraf/types";
import { Markup } from "telegraf";
import type { MyContext } from "../../shared/types";
import {
  getUserStatsByTgId,
  getTopRereads,
  getTopEndingChoices,
} from "../../features/stats/userStats.service";
function fmtMs(ms?: number) {
  if (!ms || ms <= 0) return "-";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m} мин ${sec} сек` : `${sec} сек`;
}

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cut(s?: string, n = 40) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export async function renderProfileUserStatsScreen(ctx: MyContext) {
  const tgId = ctx.state.user?.tgId;
  const stats = await getUserStatsByTgId(tgId);

  const storiesStartedCount = stats?.storiesStartedCount ?? 0;
  const storiesCompletedCount = stats?.storiesCompletedCount ?? 0;
  const endingsChosenCount = stats?.endingsChosenCount ?? 0;
  const dropsCount = stats?.dropsCount ?? 0;
  const avgReadTimeMs = stats?.avgReadTimeMs ?? 0;
  const longestStoryChars = stats?.longestStoryChars ?? 0;

  const topRereads = await getTopRereads(stats, 3);
  const topEndings = await getTopEndingChoices(stats, 3);

  const topRereadsTxt = topRereads.length
    ? topRereads
        .map(
          (r, i) => `${i + 1}. ${html(cut(r.title) || r.storyId)} — ${r.count}×`
        )
        .join("\n")
    : "—";

  const topEndingsTxt = topEndings.length
    ? topEndings
        .map((e, i) => {
          const left = html(cut(e.title) || e.storyId);
          const right = e.label ? ` (вариант: ${html(e.label)})` : "";
          return `${i + 1}. ${left}${right} — ${e.count}×`;
        })
        .join("\n")
    : "—";

  const text = `Твоя статистика

Запущено историй: <b>${storiesStartedCount}</b>
Прочитано до конца: <b>${storiesCompletedCount}</b>
Выборов концовок: <b>${endingsChosenCount}</b>
Брошено историй: <b>${dropsCount}</b>

Среднее время чтения: <b>${fmtMs(avgReadTimeMs)}</b>
Самая длинная история: <b>${longestStoryChars}</b> символов

<b>Топ перечитываемых</b>:
${topRereadsTxt}

<b>Популярные выборы концовок</b>:
${topEndingsTxt}`;

  const inlineKb = Markup.inlineKeyboard([
    [Markup.button.callback("↩︎ В профиль", "profile")],
    [Markup.button.callback("🏠 На главную", "main")],
  ]);

  return {
    text,
    inline: inlineKb,
    parseMode: "HTML" as const,
  };
}
