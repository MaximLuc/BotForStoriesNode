import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { Story } from "../../db/models/Story.js";
import { UserStoryAccess } from "../../db/models/UserStoryAccess.js";
import { UserEndingChoice } from "../../db/models/UserEndingChoice.js";
import { Types } from "mongoose";

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDt(dt?: any | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function cut(s?: string, n = 44) {
  const t = (s ?? "").trim();
  if (!t) return "—";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function fmtInt(n: any) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? String(Math.floor(x)) : "0";
}

type LeanStory = {
  _id: any;
  title: string;
  isPublished: boolean;
  publishAt?: Date | null;
  publishedAt?: Date | null;
  createdAt?: Date;
  stats?: { views?: number };
};

function statusLine(s: LeanStory) {
  if (s.isPublished) return `✅ опубликована: <b>${fmtDt(s.publishedAt ?? s.createdAt)}</b>`;
  // сюда попадут только запланированные (publishAt != null)
  return `⏱ будет опубликована: <b>${fmtDt(s.publishAt)}</b>`;
}

export async function renderAdminStoriesBriefScreen(ctx: MyContext) {
  // 1) запланированные (без черновиков!)
  const scheduled = await Story.find(
    { isPublished: false, publishAt: { $ne: null } },
    { _id: 1, title: 1, isPublished: 1, publishAt: 1, publishedAt: 1, createdAt: 1, stats: 1 }
  )
    .sort({ publishAt: 1, createdAt: -1 })
    .limit(7)
    .lean<LeanStory[]>();

  // 2) последние опубликованные
  const published = await Story.find(
    { isPublished: true },
    { _id: 1, title: 1, isPublished: 1, publishAt: 1, publishedAt: 1, createdAt: 1, stats: 1 }
  )
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(7)
    .lean<LeanStory[]>();

  // 3) объединяем и режем до 7
  const merged = [...scheduled, ...published].slice(0, 7);

  if (!merged.length) {
    return {
      text: "Пока нет запланированных или опубликованных историй.",
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ В админ-меню", "admin")],
        [Markup.button.callback("🏠 На главную", "main")],
      ]),
      parseMode: "HTML" as const,
    };
  }

  const ids = merged.map((s) => new Types.ObjectId(String(s._id)));

  // 🔑 потрачено на истории (сумма paidTokens)
  const storySpentAgg = await UserStoryAccess.aggregate([
    { $match: { storyId: { $in: ids } } },
    { $group: { _id: "$storyId", tokens: { $sum: "$paidTokens" } } },
  ]);

  const storySpentMap = new Map<string, number>(
    storySpentAgg.map((x: any) => [String(x._id), Number(x.tokens ?? 0)])
  );


  const endingSpentAgg = await UserEndingChoice.aggregate([
    { $match: { storyId: { $in: ids } } },
    { $project: { storyId: 1, extraCnt: { $size: { $ifNull: ["$extraEndingIds", []] } } } },
    { $group: { _id: "$storyId", extra: { $sum: "$extraCnt" } } },
  ]);

  const endingSpentMap = new Map<string, number>(
    endingSpentAgg.map((x: any) => [String(x._id), Number(x.extra ?? 0)])
  );

  const lines = merged.map((s, i) => {
    const id = String(s._id);
    const title = html(cut(s.title, 52));
    const st = statusLine(s);

    const views = Number((s.stats as any)?.views ?? 0);
    const storySpent = storySpentMap.get(id) ?? 0;
    const endingSpent = endingSpentMap.get(id) ?? 0;
    const totalSpent = storySpent + endingSpent;

    const viewsLine = s.isPublished ? `👁 просмотры: <b>${fmtInt(views)}</b>\n` : "";

    const spentLine =
      `🗝 потрачено: <b>${fmtInt(totalSpent)}</b>` +
      ` (история: ${fmtInt(storySpent)}, концовки: ${fmtInt(endingSpent)})`;

    return (
      `<b>${i + 1}. ${title}</b>\n` +
      `${st}\n` +
      viewsLine +
      `${spentLine}`
    );
  });

  const text =
    `📌 <b>Истории: запланированные и последние опубликованные</b>\n` +
    `Показываю максимум <b>7</b> историй.\n\n` +
    lines.join("\n\n");

  return {
    text,
    inline: Markup.inlineKeyboard([
      [Markup.button.callback("↻ Обновить", "admin:stories_brief")],
      [Markup.button.callback("↩︎ В админ-меню", "admin")],
      [Markup.button.callback("🏠 На главную", "main")],
    ]),
    parseMode: "HTML" as const,
  };
}
