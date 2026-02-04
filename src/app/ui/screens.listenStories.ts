import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import type { ScreenPayload } from "./screens.js";
import { AudioStory } from "../../db/models/AudioStory.js";
import { AudioPurchase } from "../../db/models/AudioPurchase.js";
import type { InlineKeyboardButton } from "telegraf/types";
import { Types } from "mongoose";

const PAGE_SIZE = 10;
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

function truncate(text: string, max = 26) {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function isNew(createdAt?: any) {
  if (!createdAt) return false;
  const ts = new Date(createdAt as any).getTime();
  return Date.now() - ts <= NEW_WINDOW_MS;
}

function formatDuration(sec?: number) {
  const s = Math.max(0, Math.floor(Number(sec ?? 0)));
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export async function renderListenStoriesScreen(
  ctx: MyContext
): Promise<ScreenPayload> {
  let page = 0;
  const data =
    typeof ctx.callbackQuery === "object" && "data" in (ctx.callbackQuery ?? {})
      ? String((ctx.callbackQuery as any).data)
      : "";

  if (data.startsWith("listen_stories:page:")) {
    const p = Number(data.split(":")[2]);
    if (Number.isFinite(p) && p >= 0) page = p;
  }

  const u = ctx.state.user;
  const userId = (u as any)?._id as Types.ObjectId | undefined;

  const top = await AudioStory.findOne({})
    .sort({ opensCount: -1, createdAt: -1 })
    .select({ _id: 1, opensCount: 1 })
    .lean();

  const topId = top?._id ? String((top as any)._id) : null;
  const topHasPlays = (top as any)?.opensCount > 0;

  const total = await AudioStory.countDocuments({});
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages - 1) page = pages - 1;

  const docs = await AudioStory.find({})
    .sort({ createdAt: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  if (!docs.length) {
    return {
      text:
        "🎧 ГС-истории\n\n" +
        "Пока нет добавленных голосовых историй.",
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ В меню", "main")],
      ]),
    };
  }

  const purchased = new Set<string>();
  if (userId) {
    const ids = docs.map((d: any) => d._id).filter(Boolean);
    const buys = await AudioPurchase.find({
      userId,
      audioStoryId: { $in: ids },
    })
      .select({ audioStoryId: 1 })
      .lean();

    for (const b of buys) purchased.add(String((b as any).audioStoryId));
  }

  const header =
    `🎧 Озвученные истории\n\n` +
    `Здесь — озвученные истории, которые можно слушать прямо в чате.\n` +
    `История покупается *один раз* за ключи и остаётся доступной.\n\n` +
    `Небольшие советы:\n` +
    `🆕 — новая (первые 24 часа)\n` +
    `🔥 — самая популярная\n` +
    `🔓 — куплено\n` +
    `⏱ — длительность\n` +
    `💰 — цена\n\n` +
    `Стр. ${page + 1}/${pages} • всего ${total}\n`;

  const lines = docs.map((s: any) => {
    const id = String(s._id);
    const price = Math.max(0, Math.floor(Number(s.priceTokens ?? 0)));
    const dur = formatDuration(s.durationSec);

    const badges: string[] = [];
    if (isNew(s.createdAt)) badges.push("🆕");
    if (topId && topHasPlays && id === topId) badges.push("🔥");
    if (purchased.has(id)) badges.push("🔓");

    const badgeText = badges.length ? badges.join(" ") + " " : "";
    return ` • ${badgeText}${truncate(String(s.title ?? ""))} — ⏱ ${dur} • 💰 ${price} ключей`;
  });

  const rows: InlineKeyboardButton[][] = docs.map((s: any) => {
    const id = String(s._id);
    const bought = purchased.has(id);
    const prefix = bought ? "🔓" : "🎧";

    return [
      Markup.button.callback(
        `${prefix} ${truncate(String(s.title ?? ""), 30)}`,
        `audio:open:${id}`
      ),
    ];
  });

  const navRow: InlineKeyboardButton[] = [];
  if (page > 0)
    navRow.push(
      Markup.button.callback("◀️ Назад", `listen_stories:page:${page - 1}`)
    );
  if (page < pages - 1)
    navRow.push(
      Markup.button.callback("Вперед ▶️", `listen_stories:page:${page + 1}`)
    );

  if (navRow.length) rows.push(navRow);
  rows.push([Markup.button.callback("↩︎ В меню", "main")]);

  return {
    text: [header, ...lines].join("\n"),
    inline: Markup.inlineKeyboard(rows),
    parseMode: "Markdown",
  };
}
