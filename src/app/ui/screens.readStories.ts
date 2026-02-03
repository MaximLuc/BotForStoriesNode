import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import type { ScreenPayload } from "./screens.js";
import { Story } from "../../db/models/Story.js";
import { StoryReadSession } from "../../db/models/StoryReadSession.js";
import { UserStoryAccess } from "../../db/models/UserStoryAccess.js";
import type { InlineKeyboardButton } from "telegraf/types";
import { Types } from "mongoose";
import {
  STORIES_PAGE_SIZE,
  LIST_DOT_CHAR,
  LIST_DOT_WIDTH,
  TITLE_TRUNCATE_LIST,
  TITLE_TRUNCATE_BUTTON,
  STORY_PAGE_LEN_TEXT,
  STORY_FIRST_PAGE_CAPTION_LEN,
} from "../../shared/constants.js";

const PAGE_SIZE = STORIES_PAGE_SIZE;
const NEW_MS = 24 * 60 * 60 * 1000; // 24 часа

function truncate(text: string, max = TITLE_TRUNCATE_LIST) {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function dotLeaders(left: string, right: string, width = LIST_DOT_WIDTH) {
  const L = left.trim();
  const R = right.trim();
  const dots = Math.max(1, width - (L.length + R.length));
  return `${L} ${LIST_DOT_CHAR.repeat(dots)} ${R}`;
}

function isNew(createdAt?: any) {
  if (!createdAt) return false;
  const ts = new Date(createdAt as any).getTime();
  return Date.now() - ts <= NEW_MS;
}

function fmtKeys(n: any) {
  const v = Math.max(0, Math.floor(Number(n ?? 0)));
  return `🗝️${v}`;
}

function paginateSegment(text: string, limit: number): string[] {
  const t = (text ?? "").trim();
  if (t.length <= limit) return [t];

  const parts: string[] = [];
  let i = 0;
  while (i < t.length) {
    let end = Math.min(i + limit, t.length);
    if (end < t.length) {
      const slice = t.slice(i, end);
      let cut = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"));
      if (cut < Math.floor(limit * 0.7)) cut = slice.lastIndexOf(" ");
      end = cut > 0 ? i + cut : end;
    }
    parts.push(t.slice(i, end).trim());
    i = end;
  }
  return parts.filter(Boolean);
}

function countPages(text: string, hasCover: boolean) {
  const t = (text ?? "").trim();
  if (!hasCover) return Math.max(1, paginateSegment(t, STORY_PAGE_LEN_TEXT).length);

  if (t.length <= STORY_FIRST_PAGE_CAPTION_LEN) return 1;

  const head = t.slice(0, STORY_FIRST_PAGE_CAPTION_LEN);
  let cut = Math.max(head.lastIndexOf("\n\n"), head.lastIndexOf("\n"));
  if (cut < Math.floor(STORY_FIRST_PAGE_CAPTION_LEN * 0.7)) cut = head.lastIndexOf(" ");
  const rest = t.slice(cut > 0 ? cut : STORY_FIRST_PAGE_CAPTION_LEN).trim();

  const tail = paginateSegment(rest, STORY_PAGE_LEN_TEXT);
  return Math.max(1, 1 + tail.length);
}

type ButtonItem = {
  _id: string;
  title: string;
  createdAt?: any;
  badgeNew?: boolean;
  badgeTop7d?: boolean;
  statusIcon: string;
  metaRight: string;
};

function twoColButtons(items: ButtonItem[]) {
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i];
    const b = items[i + 1];

    const aLabel =
      `${a.statusIcon}` +
      `${a.badgeTop7d ? "🔥" : ""}` +
      `${a.badgeNew ? "🆕 " : ""}` +
      `${truncate(a.title, TITLE_TRUNCATE_BUTTON)}`;

    const row: InlineKeyboardButton[] = [
      Markup.button.callback(aLabel, `story:${a._id}`),
    ];

    if (b) {
      const bLabel =
        `${b.statusIcon}` +
        `${b.badgeTop7d ? "🔥" : ""}` +
        `${b.badgeNew ? "🆕 " : ""}` +
        `${truncate(b.title, TITLE_TRUNCATE_BUTTON)}`;
      row.push(Markup.button.callback(bLabel, `story:${b._id}`));
    }

    rows.push(row);
  }
  return rows;
}

export async function renderReadStoriesScreen(ctx: MyContext): Promise<ScreenPayload> {
  let page = 0;
  const data =
    typeof ctx.callbackQuery === "object" && "data" in (ctx.callbackQuery ?? {})
      ? String((ctx.callbackQuery as any).data)
      : "";

  if (data.startsWith("read_stories:page:")) {
    const p = Number(data.split(":")[2]);
    if (Number.isFinite(p) && p >= 0) page = p;
  }

  const query = { isPublished: true } as any;

  const total = await Story.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages - 1) page = pages - 1;

  const docs = await Story.find(query)
    .sort({ createdAt: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  if (!docs.length) {
    return {
      text: "Пока нет историй.",
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ В меню", "main")]]),
    };
  }

  // 🔥 топ среди историй, вышедших за последние 7 дней (по stats.views)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const top7d = await Story.find(
    { isPublished: true, createdAt: { $gte: since7d } },
    { _id: 1, "stats.views": 1 }
  )
    .sort({ "stats.views": -1, createdAt: -1 })
    .limit(1)
    .lean();

  const topId7d = top7d.length ? String((top7d[0] as any)._id) : null;

  // статусы: куплено / прочитано
  const userId = (ctx.state.user as any)?._id as Types.ObjectId | undefined;
  const storyIds = docs.map((d: any) => new Types.ObjectId(String(d._id)));

  let boughtSet = new Set<string>();
  let readSet = new Set<string>();

  if (userId) {
    // ✅ куплено = есть запись в UserStoryAccess
    const bought = await UserStoryAccess.find(
      { userId, storyId: { $in: storyIds } },
      { storyId: 1 }
    ).lean();

    boughtSet = new Set(bought.map((x: any) => String(x.storyId)));

    // ✅ прочитано = есть завершённая сессия
    const read = await StoryReadSession.find(
      { userId, storyId: { $in: storyIds }, completed: true },
      { storyId: 1 }
    ).lean();

    readSet = new Set(read.map((x: any) => String(x.storyId)));
  }

  const items: ButtonItem[] = docs.map((d: any) => {
    const id = String(d._id);
    const price = Math.max(0, Math.floor(Number(d.entryTokens ?? 0)));
    const pagesCount = countPages(String(d.text ?? ""), !!d.coverUrl);

    const isBought = price <= 0 ? true : boughtSet.has(id);
    const isRead = readSet.has(id);

    // 📗 прочитано, 📖 доступно, 💠 платное
    const statusIcon = isRead ? "📗 " : isBought ? "📖 " : "💠 ";

    return {
      _id: id,
      title: String(d.title ?? ""),
      createdAt: d.createdAt,
      badgeNew: isNew(d.createdAt),
      badgeTop7d: !!topId7d && id === topId7d,
      statusIcon,
      metaRight: `${fmtKeys(price)} · ${pagesCount} стр.`,
    };
  });

  const header =
    `📚 *Истории*\n` +
    `Выбирай и читай в одном окне.\n` +
    `Стр. ${page + 1}/${pages} · всего ${total}\n\n` +
    `*Легенда:*\n` +
    `🆕 — новая (24ч)\n` +
    `🔥 — самая популярная среди новых (7 дней)\n` +
    `📖 — доступна\n` +
    `💠 — платная\n` +
    `📗 — прочитана\n` +
    `🗝️N — цена в ключах\n`;

  const lines = items.map((it) => {
    const left = `${it.statusIcon}${it.badgeTop7d ? "🔥" : ""}${it.badgeNew ? "🆕 " : ""}${truncate(it.title)}`;
    return " " + dotLeaders(left, it.metaRight);
  });

  const text = [header, ...lines].join("\n");

  const storyRows = twoColButtons(items);

  const navRow: InlineKeyboardButton[] = [];
  if (page > 0) navRow.push(Markup.button.callback("◀️ Назад", `read_stories:page:${page - 1}`));
  if (page < pages - 1) navRow.push(Markup.button.callback("Вперед ▶️", `read_stories:page:${page + 1}`));

  const rows: InlineKeyboardButton[][] = [
    ...storyRows,
    ...(navRow.length ? [navRow] : []),
    [Markup.button.callback("↩︎ В меню", "main")],
  ];

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
    parseMode: "Markdown",
  };
}
