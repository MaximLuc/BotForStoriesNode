import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
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
      text: `Доступ к истории: сейчас *${accessLabel(
        d.minRank
      )}*\nВыберите доступ:`,
      inline: Markup.inlineKeyboard([
        [cb("🌏 ВСЕМ", "draft:access_story:all")],
        [cb("👥 ТОЛЬКО ПОДПИСЧИКАМ", "draft:access_story:premium")],
        [cb("⬅️ Отмена", "draft:cancel_access")],
      ]),
    };
  }
  if (d.pendingInput && (d.pendingInput as any).kind === "accessEnding") {
    const i = (d.pendingInput as any).index as number;
    const e = (d.endings as DraftEnding[])[i];
    return {
      text: `Доступ к продолжению #${i + 1}: сейчас *${accessLabel(
        e?.minRank
      )}*\nВыберите доступ:`,
      inline: Markup.inlineKeyboard([
        [cb("🌏 ВСЕМ", `draft:end_access_set:${i}:all`)],
        [cb("👥 ТОЛЬКО ПОДПИСЧИКАМ", `draft:end_access_set:${i}:premium`)],
        [cb("⬅️ Отмена", "draft:cancel_access")],
      ]),
    };
  }

  const rows: InlineKeyboardButton[][] = [];

  rows.push([cb("🪝ЗАДАТЬ НАЗВАНИЕ", "draft:set_title")]);
  rows.push([cb("🗣️ДОБАВИТЬ ТЕКСТ ДО ВЫБОРА", "draft:set_intro")]);
  rows.push([
    cb(
      `🔐ДОСТУП К ИСТОРИИ: ${accessLabel(d.minRank)}`,
      "draft:ask_access_story"
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
      cb(`🔐ДОСТУП: ${accessLabel(e?.minRank)}`, `draft:ask_end_access:${i}`),
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
            `#${i + 1} ${e.title ? `«${e.title}»` : "—"}  ·  ${accessLabel(
              e?.minRank
            )}\n↳ ${preview(e.text, 10)}`
        )
        .join("\n")
    : "—";

  const text = `Создание истории (форма)

Название: ${d.title ?? "—"}
Начало: ${preview(d.intro)}
Доступ к истории: ${accessLabel(d.minRank)}

Окончания:
${endingsPreview}
`;

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
  };
}
