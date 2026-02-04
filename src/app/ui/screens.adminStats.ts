import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import {
  getGlobalAudioStats,
  getTopAudioByOpens,
  getTopAudioByTokensSpent,
  getRecentAudioTrend,
  getNewestAudioStories,
} from "../../features/stats/adminStats.service.js";

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cut(s?: string, n = 46) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtInt(n?: number) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? String(Math.floor(x)) : "0";
}

function fmtDur(sec?: number) {
  const s = Math.max(0, Math.floor(Number(sec ?? 0)));
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function pct(n?: number) {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return "0%";
  return `${(Math.round(x * 10) / 10).toFixed(1)}%`;
}

export async function renderAdminStatsAudioScreen(ctx: MyContext) {
  const [global, topOpens, topTokens, trend, newest] = await Promise.all([
    getGlobalAudioStats(),
    getTopAudioByOpens(5),
    getTopAudioByTokensSpent(5),
    getRecentAudioTrend(7),
    getNewestAudioStories(5),
  ]);

  const topOpensTxt = topOpens.length
    ? topOpens
        .map((t, i) => {
          const title = html(cut(t.title));
          return (
            `${i + 1}. ${title}\n` +
            `   🎧 открытий: <b>${fmtInt(t.opensCount)}</b> • закрытий: <b>${fmtInt(
              t.closesCount
            )}</b> • конверсия закрытий: <b>${pct(t.closeRatePct)}</b>\n` +
            `   ⏱ ${fmtDur(t.durationSec)} • 💰 цена: <b>${fmtInt(
              t.priceTokens
            )}</b> • потрачено: <b>${fmtInt(t.tokensSpent)}</b>`
          );
        })
        .join("\n")
    : "—";

  const topTokensTxt = topTokens.length
    ? topTokens
        .map((t, i) => {
          const title = html(cut(t.title));
          return (
            `${i + 1}. ${title}\n` +
            `   💸 потрачено токенов: <b>${fmtInt(t.tokensSpent)}</b> • 🎧 открытий: <b>${fmtInt(
              t.opensCount
            )}</b>\n` +
            `   ⏱ ${fmtDur(t.durationSec)} • 💰 цена: <b>${fmtInt(
              t.priceTokens
            )}</b>`
          );
        })
        .join("\n")
    : "—";

  const trendTxt = trend.length
    ? trend
        .map(
          (b) =>
            `${b.date}: покупок <b>${fmtInt(b.purchases)}</b>, токенов <b>${fmtInt(
              b.tokensSpent
            )}</b>, новых историй <b>${fmtInt(b.newStories)}</b>`
        )
        .join("\n")
    : "—";

  const newestTxt = newest.length
    ? newest
        .map(
          (s, i) =>
            `${i + 1}. ${html(cut(s.title))} • ⏱ ${fmtDur(
              s.durationSec
            )} • 💰 ${fmtInt(s.priceTokens)}`
        )
        .join("\n")
    : "—";

  const text =
    `🧑‍💻 <b>Статистика ГС-историй</b>\n\n` +
    `Здесь собраны показатели по голосовым историям.\n` +
    `Считаем: открытия/закрытия, покупки и потраченные токены.\n\n` +
    `<b>Глобально</b>\n` +
    `Историй всего: <b>${fmtInt(global.storiesTotal)}</b>\n` +
    `Открытий: <b>${fmtInt(global.totalOpens)}</b> • Закрытий: <b>${fmtInt(
      global.totalCloses
    )}</b> • Конверсия закрытий: <b>${pct(global.closeRatePct)}</b>\n` +
    `Покупок: <b>${fmtInt(global.totalPurchases)}</b>\n` +
    `Потрачено токенов всего: <b>${fmtInt(global.totalTokensSpent)}</b>\n` +
    `Средняя цена: <b>${fmtInt(global.avgPriceTokens)}</b> ток. • Суммарная длительность: <b>${fmtDur(
      global.totalDurationSec
    )}</b>\n\n` +
    `<b>Топ по открытиям</b>\n${topOpensTxt}\n\n` +
    `<b>Топ по потраченным токенам</b>\n${topTokensTxt}\n\n` +
    `<b>Тренд (последние 7 дней)</b>\n${trendTxt}\n\n` +
    `<b>Новые (последние 24 часа)</b>\n${newestTxt}`;

  return {
    text,
    inline: Markup.inlineKeyboard([
      [Markup.button.callback("↩︎ В админ-меню", "admin")],
      [Markup.button.callback("🏠 На главную", "main")],
    ]),
    parseMode: "HTML" as const,
  };
}
