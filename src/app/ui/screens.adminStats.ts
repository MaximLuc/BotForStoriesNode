import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import {
  getGlobalStoryStats,
  getTopStories,
  getRecentTrend,
} from "../../features/stats/adminStats.service.js";

function fmtMs(ms?: number) {
  if (!ms || ms <= 0) return "-";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m} мин ${sec} сек` : `${sec} сек`;
}
function pct(n: number) {
  if (!isFinite(n)) return "0%";
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}
function cut(s?: string, n = 42) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function renderAdminStatsScreen(ctx: MyContext) {
  const [global, top, trend] = await Promise.all([
    getGlobalStoryStats(),
    getTopStories(5),
    getRecentTrend(7),
  ]);

  const topTxt = top.length
    ? top
        .map(
          (t, i) =>
            `${i + 1}. ${html(cut(t.title))}\n` +
            `   просмотры: <b>${t.views}</b>, начато: <b>${
              t.started
            }</b> (${pct(t.conversionStartedPct)} от просмотров),\n` +
            `   завершено: <b>${t.completed}</b> (${pct(
              t.conversionCompletedPct
            )} от начатых), брошено: <b>${
              t.drop
            }</b>, среднее чтение: <b>${fmtMs(t.avgReadTimeMs)}</b>`
        )
        .join("\n")
    : "—";

  const trendTxt = trend
    .map(
      (b) =>
        `${b.date}: начато <b>${b.started}</b>, завершено <b>${b.completed}</b>, брошено <b>${b.drops}</b>`
    )
    .join("\n");

  const text = `🧑‍💻 <b>Статистика (админ)</b>

<b>Глобально</b>
Историй всего: <b>${global.storiesTotal}</b> (опубликовано: <b>${
    global.publishedStories
  }</b>)
Просмотры: <b>${global.totalViews}</b>
Начато: <b>${global.totalStarted}</b> • Завершено: <b>${
    global.totalCompleted
  }</b> • Брошено: <b>${global.totalDrops}</b>
Среднее время чтения: <b>${fmtMs(global.avgReadTimeMs)}</b>
Амортизированная уникальная аудитория: <b>${global.uniqueReadersApprox}</b>

<b>Топ историй</b>
${topTxt}

<b>Тренд (последние 7 дней)</b>
${trendTxt}`;

  return {
    text,
    inline: Markup.inlineKeyboard([
      [Markup.button.callback("↩︎ В админ-меню", "admin")],
      [Markup.button.callback("🏠 На главную", "main")],
    ]),
    parseMode: "HTML" as const,
  };
}
