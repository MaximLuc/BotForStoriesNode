import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import type { ScreenPayload } from "./screens.js";
import { Story } from "../../db/models/Story.js";
import type { InlineKeyboardButton } from "telegraf/types";
import { Types } from "mongoose";
import {
  STORY_PAGE_LEN_TEXT,
  STORY_FIRST_PAGE_CAPTION_LEN,
  ENDING_PAGE_LEN_TEXT,
  STAR_BADGE,
} from "../../shared/constants.js";

type EndingLean = {
  _id: any;
  title?: string;
  text?: string;
  minRank?: number;
};
type StoryLean = {
  _id: any;
  title: string;
  text: string;
  endings: EndingLean[];
  isPublished: boolean;
  minRank?: number;
  coverUrl?: string;
  entryTokens?: number;
};

const PAGE_LEN_TEXT = STORY_PAGE_LEN_TEXT;
const FIRST_PAGE_CAPTION_LEN = STORY_FIRST_PAGE_CAPTION_LEN;

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

export function paginateStory(text: string, hasCover: boolean): string[] {
  const t = (text ?? "").trim();
  if (!hasCover) return paginateSegment(t, PAGE_LEN_TEXT);

  if (t.length <= FIRST_PAGE_CAPTION_LEN) return [t];

  let end = FIRST_PAGE_CAPTION_LEN;
  const head = t.slice(0, end);
  let cut = Math.max(head.lastIndexOf("\n\n"), head.lastIndexOf("\n"));
  if (cut < Math.floor(FIRST_PAGE_CAPTION_LEN * 0.7)) cut = head.lastIndexOf(" ");
  const first = t.slice(0, cut > 0 ? cut : end).trim();
  const rest = t.slice(cut > 0 ? cut : end).trim();

  const tailParts = paginateSegment(rest, PAGE_LEN_TEXT);
  return [first, ...tailParts];
}

export function makePagerRow(storyId: string, page: number, pages: number): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = [];
  if (page > 0) row.push(Markup.button.callback("◀️ Назад", `read:story:${storyId}:p:${page - 1}`));
  row.push(Markup.button.callback(`Стр. ${page + 1} / ${pages}`, "noop"));
  if (page < pages - 1) row.push(Markup.button.callback("Вперед ▶️", `read:story:${storyId}:p:${page + 1}`));
  return row;
}

export function makeEndingPagerRow(storyId: string, idx: number, page: number, pages: number): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = [];
  if (page > 0) row.push(Markup.button.callback("◀️ Назад", `read:end:${storyId}:${idx}:p:${page - 1}`));
  row.push(Markup.button.callback(`Стр. ${page + 1} / ${pages}`, "noop"));
  if (page < pages - 1) row.push(Markup.button.callback("Вперед ▶️", `read:end:${storyId}:${idx}:p:${page + 1}`));
  return row;
}

function star(minRank?: number) {
  return (minRank ?? 0) >= 1 ? STAR_BADGE : "";
}

export async function renderReadStoryScreen(ctx: MyContext): Promise<ScreenPayload> {
  const raw =
    typeof ctx.callbackQuery === "object" && "data" in (ctx.callbackQuery ?? {})
      ? String((ctx.callbackQuery as any).data)
      : "";

  let storyId = "";
  let page = 0;

  const mPage = raw.match(/^read:story:([^:]+):p:(\d+)$/);
  const mOpen = raw.match(/^story:([^:]+)$/);

  if (mPage) {
    storyId = mPage[1];
    page = Math.max(0, Number(mPage[2]) || 0);
  } else if (mOpen) {
    storyId = mOpen[1];
  } else {
    storyId = (ctx as any).state?.storyId ?? "";
  }

  const s = await Story.findById(storyId).lean<StoryLean>();
  if (!s || !s.isPublished) {
    return {
      text: "История не найдена или недоступна.",
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ К списку", "read_stories")]]),
    };
  }

  const hasCover = !!s.coverUrl;
  const parts = paginateStory(s.text || "", hasCover);
  const pages = Math.max(1, parts.length);
  if (page > pages - 1) page = pages - 1;

  const price = Math.max(0, Math.floor(Number((s as any).entryTokens ?? 0)));
  const priceLine = price > 0 ? `\n💰 Цена: <b>${price}</b> ключ.` : `\n✅ Бесплатно`;

  const titleLine = `<b>${s.title}</b>${(s.minRank ?? 0) >= 1 ? "  ⭐" : ""}`;
  const header = pages > 1 ? `<i>(страница ${page + 1}/${pages})</i>\n\n` : "";
  const body = parts[page] || "";
  const text = `${titleLine}${priceLine}\n\n${header}${body}`;

  const rows: InlineKeyboardButton[][] = [];
  if (pages > 1) rows.push(makePagerRow(String(s._id), page, pages));

  if (page === pages - 1) {
    const ends = Array.isArray(s.endings) ? s.endings : [];
    if (ends.length) {
      for (let i = 0; i < ends.length; i += 2) {
        const A = ends[i];
        const B = ends[i + 1];
        const row: InlineKeyboardButton[] = [
          Markup.button.callback(
            `${star(A?.minRank)}${A?.title ?? `Вариант ${i + 1}`}`,
            `read:choose:${s._id}:${i}`
          ),
        ];
        if (B) {
          row.push(
            Markup.button.callback(
              `${star(B?.minRank)}${B?.title ?? `Вариант ${i + 2}`}`,
              `read:choose:${s._id}:${i + 1}`
            )
          );
        }
        rows.push(row);
      }
    } else {
      rows.push([Markup.button.callback("Варианты отсутствуют", "noop")]);
    }
  }

  rows.push([Markup.button.callback("↩︎ К списку", `read:list_from:${s._id}`)]);

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
    parseMode: "HTML",
  };
}

export async function renderReadEndingScreen(
  ctx: MyContext,
  opts?: { storyId?: string; endingIndex?: number; page?: number }
): Promise<ScreenPayload> {
  let storyId: string | undefined = opts?.storyId;
  let idx: number | undefined = opts?.endingIndex;
  let page: number = typeof opts?.page === "number" ? opts!.page! : 0;

  if (!storyId || typeof idx !== "number") {
    const raw =
      typeof ctx.callbackQuery === "object" && "data" in (ctx.callbackQuery ?? {})
        ? String((ctx.callbackQuery as any).data)
        : "";

    const mChoose = raw.match(/^read:choose:([^:]+):(\d+)$/);
    const mEnd = raw.match(/^read:end:([^:]+):(\d+):p:(\d+)$/);

    if (mEnd) {
      storyId = storyId ?? mEnd[1];
      idx = typeof idx === "number" ? idx : Math.max(0, Number(mEnd[2]) || 0);
      page = Math.max(0, Number(mEnd[3]) || 0);
    } else if (mChoose) {
      storyId = storyId ?? mChoose[1];
      idx = typeof idx === "number" ? idx : Math.max(0, Number(mChoose[2]) || 0);
      page = 0;
    } else {
      storyId = storyId ?? (ctx as any).state?.storyId ?? "";
      idx = typeof idx === "number" ? idx : Number((ctx as any).state?.endingIndex ?? 0);
    }
  }

  if (!storyId || !Types.ObjectId.isValid(storyId)) {
    return {
      text: "История недоступна.",
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ К списку", "read_stories")]]),
    };
  }
  if (typeof idx !== "number" || idx < 0) {
    return {
      text: "Окончание не найдено.",
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ К истории", `story:${storyId}`)]]),
    };
  }

  const s = await Story.findById(storyId).lean<StoryLean>();
  if (!s || !s.isPublished) {
    return {
      text: "История недоступна.",
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ К списку", "read_stories")]]),
    };
  }

  const ending = (s.endings ?? [])[idx];
  if (!ending) {
    return {
      text: "Окончание не найдено.",
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ К истории", `story:${storyId}`)]]),
    };
  }

  const parts = paginateSegment(ending.text || "", ENDING_PAGE_LEN_TEXT);
  const pages = Math.max(1, parts.length);
  if (page > pages - 1) page = pages - 1;

  const titleLine = `<b>${s.title}</b>\n<i>${ending.title ?? "Окончание"}</i>`;
  const header = pages > 1 ? `<i>(страница ${page + 1}/${pages})</i>\n\n` : "";
  const body = parts[page] || "";
  const text = `${titleLine}\n\n${header}${body}`;

  const rows: InlineKeyboardButton[][] = [];
  if (pages > 1) rows.push(makeEndingPagerRow(String(s._id), idx, page, pages));

  const lastStoryPage = Math.max(0, paginateStory(s.text || "", !!s.coverUrl).length - 1);
  rows.push([Markup.button.callback("↩︎ К истории", `read:story:${s._id}:p:${lastStoryPage}`)]);
  rows.push([Markup.button.callback("📚 К списку", `read:list_from:${s._id}`)]);

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
    parseMode: "HTML",
  };
}
