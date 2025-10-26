import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import type { ScreenPayload } from "./screens.js";
import { Story } from "../../db/models/Story.js";
import type { InlineKeyboardButton } from "telegraf/types";
import {
  STORIES_PAGE_SIZE,
  NEW_STORY_WINDOW_MS,
  NEW_BADGE_PREFIX,
  NEW_BADGE_SUFFIX,
  STAR_BADGE,
  LIST_DOT_CHAR,
  LIST_DOT_WIDTH,
  TITLE_TRUNCATE_LIST,
  TITLE_TRUNCATE_BUTTON,
} from "../../shared/constants.js";

const PAGE_SIZE = STORIES_PAGE_SIZE;
const NEW_MS = NEW_STORY_WINDOW_MS;

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
function star(minRank?: number) {
  return (minRank ?? 0) >= 1 ? STAR_BADGE : "";
}
function isNew(createdAt?: any) {
  if (!createdAt) return false;
  const ts = new Date(createdAt as any).getTime();
  return Date.now() - ts <= NEW_MS;
}

function twoColButtons(
  items: { _id: string; title: string; minRank?: number; createdAt?: any }[]
) {
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i];
    const b = items[i + 1];
    const row: InlineKeyboardButton[] = [
      Markup.button.callback(
        `${star(a.minRank)}${isNew(a.createdAt) ? NEW_BADGE_PREFIX : ""}${truncate(
          a.title,
          TITLE_TRUNCATE_BUTTON
        )}${isNew(a.createdAt) ? NEW_BADGE_SUFFIX : ""}`,
        `story:${a._id}`
      ),
    ];
    if (b)
      row.push(
        Markup.button.callback(
          `${star(b.minRank)}${isNew(b.createdAt) ? NEW_BADGE_PREFIX : ""}${truncate(
            b.title,
            TITLE_TRUNCATE_BUTTON
          )}${isNew(b.createdAt) ? NEW_BADGE_SUFFIX : ""}`,
          `story:${b._id}`
        )
      );
    rows.push(row);
  }
  return rows;
}

export async function renderReadStoriesScreen(
  ctx: MyContext
): Promise<ScreenPayload> {
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
      text: "Пока нет опубликованных историй.",
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ В меню", "main")],
      ]),
    };
  }

  const header = `Список доступных историй (сначала новые)\nСтр. ${
    page + 1
  }/${pages} из всего ${total}\n`;
  const lines = docs.map((s) => {
    const left = `${star((s as any).minRank)}${
      isNew((s as any).createdAt) ? NEW_BADGE_PREFIX : ""
    }${truncate((s as any).title)}${
      isNew((s as any).createdAt) ? NEW_BADGE_SUFFIX : ""
    }`;
    const right = `(${Array.isArray((s as any).endings) ? (s as any).endings.length : 0})`;
    return " " + dotLeaders(left, right);
  });
  const text = [header, ...lines].join("\n");

  const storyRows = twoColButtons(
    docs.map((d) => ({
      _id: String((d as any)._id),
      title: (d as any).title,
      minRank: (d as any).minRank,
      createdAt: (d as any).createdAt,
    }))
  );

  const navRow: InlineKeyboardButton[] = [];
  if (page > 0)
    navRow.push(
      Markup.button.callback("◀️ Назад", `read_stories:page:${page - 1}`)
    );
  if (page < pages - 1)
    navRow.push(
      Markup.button.callback("Вперед ▶️", `read_stories:page:${page + 1}`)
    );

  const rows: InlineKeyboardButton[][] = [
    ...storyRows,
    ...(navRow.length ? [navRow] : []),
    [Markup.button.callback("↩︎ В меню", "main")],
  ];

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
  };
}

