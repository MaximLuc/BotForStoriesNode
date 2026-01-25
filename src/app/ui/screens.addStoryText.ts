import type { MyContext } from "../../shared/types.js";import { Markup } from "telegraf";
import {
  getOrCreateDraft,
  canCreate,
} from "../../features/stories/draft.service.js";
import type { DraftStoryDoc, DraftEnding } from "../../db/models/DraftStory.js";
import type { InlineKeyboardButton } from "telegraf/types";

function preview(str?: string | null, words = 8) {
  if (!str) return "—";
  const s = str.trim().split(/\s+/).slice(0, words).join(" ");
  return s + (str.trim().length > s.length ? "…" : "");
}
const accessLabel = (rank?: number) => (rank === 1 ? "🔒 премиум" : "🌐 всем");

const cb = (text: string, data: string): InlineKeyboardButton => ({
  text,
  callback_data: data,
});

const priceLabel = (n?: number) => {
  const v = Number(n ?? 0);
  if (!v) return "🆓 бесплатно";
  return `💰 ${v} токен(ов)`;
};

export async function renderAddStoryTextScreen(ctx: MyContext) {
  const tgId = ctx.state.user?.tgId;
  if (!tgId) {
    return {
      text: "Пользователь не найден",
      inline: Markup.inlineKeyboard([[cb("⬅️ Назад", "admin")]]),
    };
  }

  const d: DraftStoryDoc = await getOrCreateDraft(tgId);

  if (d.pendingInput && (d.pendingInput as any).kind === "accessStory") {
    return {
      text: `Цена истории: сейчас *${priceLabel((d as any).entryTokens)}*\nВыберите цену:`,
      inline: Markup.inlineKeyboard([
        [cb("🆓 Бесплатно", "draft:price_story:0")],
        [cb("💰 1 токен", "draft:price_story:1")],
        [cb("💰 3 токена", "draft:price_story:3")],
        [cb("💰 5 токенов", "draft:price_story:5")],
        [cb("⬅️ Отмена", "draft:cancel_price")],
      ]),
    };
  }
  if (d.pendingInput && (d.pendingInput as any).kind === "accessEnding") {
    const i = (d.pendingInput as any).index as number;
    const e = (d.endings as DraftEnding[])[i];
    return {
      text: `Доступ к продолжению #${i + 1}: сейчас *${accessLabel(
        e?.minRank,
      )}*\nВыберите доступ:`,
      inline: Markup.inlineKeyboard([
        [cb("🌏 ВСЕМ", `draft:end_access_set:${i}:all`)],
        [cb("👥 ТОЛЬКО ПОДПИСЧИКАМ", `draft:end_access_set:${i}:premium`)],
        [cb("⬅️ Отмена", "draft:cancel_access")],
      ]),
    };
  }

    if (d.pendingInput && (d.pendingInput as any).kind === "priceStory") {
    const cur = Math.max(0, Math.floor(Number((d as any).entryTokens ?? 0)));

    const label =
      cur === 0 ? "бесплатно" : `${cur} токен(ов)`;

    return {
      text:
        `Цена истории: сейчас <b>${label}</b>\n` +
        `Выберите цену:`,
      inline: Markup.inlineKeyboard([
        [cb("🆓 Бесплатно", "draft:price_story:0")],
        [cb("💠 1 токен", "draft:price_story:1")],
        [cb("💠 3 токена", "draft:price_story:3")],
        [cb("💠 5 токенов", "draft:price_story:5")],
        [cb("⬅️ Отмена", "draft:cancel_price")],
      ]),
      parseMode: "HTML" as const,
    };
  }


  const rows: InlineKeyboardButton[][] = [];

  rows.push([cb("🪝ЗАДАТЬ НАЗВАНИЕ", "draft:set_title")]);
  rows.push([cb("🗣️ДОБАВИТЬ ТЕКСТ ДО ВЫБОРА", "draft:set_intro")]);
  rows.push([
    cb(
      `💳 ЦЕНА ИСТОРИИ: ${priceLabel((d as any).entryTokens)}`,
      "draft:ask_price_story",
    ),
  ]);
  rows.push([cb("📎ДОБАВИТЬ ПРОДОЛЖЕНИЕ ", "draft:add_ending")]);
  (d.endings as DraftEnding[]).forEach((e, i) => {
    rows.push([
      cb(`🖋️НАЗВАНИЕ №${i + 1}`, `draft:set_end_title:${i}`),
      cb(`📃ТЕКСТ №${i + 1}`, `draft:set_end_text:${i}`),
    ]);
    rows.push([
      cb(`🗑️УДАЛИТЬ №${i + 1}`, `draft:del_end:${i}`),
    ]);
  });

  const ready = canCreate({
    title: d.title ?? undefined,
    intro: d.intro ?? undefined,
    endings: d.endings as DraftEnding[],
  });
  const finalRow: InlineKeyboardButton[] = [];
  if (ready) finalRow.push(cb("✅ Загрузить историю", "draft:commit"));
  finalRow.push(cb("⬅️ Назад", "admin"));
  rows.push(finalRow);

  const endingsPreview = d.endings.length
    ? (d.endings as DraftEnding[])
        .map(
          (e, i) =>
            `#${i + 1} ${e.title ? `«${e.title}»` : "—"}\n↳ ${preview(e.text, 10)}`
        )
        .join("\n")
    : "—";

  const text = `Создание истории (форма)

Название: ${d.title ?? "—"}
Начало: ${preview(d.intro)}
Цена истории: ${priceLabel((d as any).entryTokens)}

Окончания:
${endingsPreview}
`;

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
  };
}
