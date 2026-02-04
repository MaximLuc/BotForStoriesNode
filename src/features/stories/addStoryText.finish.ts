import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import {
  getOrCreateDraft,
  resetPending,
  setField,
  setEndingTitle,
  setEndingText,
} from "./draft.service.js";
import { renderAddStoryTextScreen } from "../../app/ui/screens.addStoryText.js";
import { aggFinalize, aggReset } from "./input.aggregator.js";
import { tryDeleteUserMessagesHard } from "./tryDelete.js";
import { safeEdit } from "../../app/ui/respond.js";
import { logTelegramError } from "../../shared/logger.js";
import { Story } from "../../db/models/Story.js";

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDtLocal(dt: Date) {
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)} ${pad(dt.getHours())}:${pad(
    dt.getMinutes()
  )}`;
}

function scheduleMenuKb(storyId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("+1 мин", `story:schedule_quick:${storyId}:m1`),
      Markup.button.callback("+5 мин", `story:schedule_quick:${storyId}:m5`),
      Markup.button.callback("+15 мин", `story:schedule_quick:${storyId}:m15`),
    ],
    [
      Markup.button.callback("+30 мин", `story:schedule_quick:${storyId}:m30`),
      Markup.button.callback("+1 час", `story:schedule_quick:${storyId}:h1`),
    ],
    [
      Markup.button.callback("+3 часа", `story:schedule_quick:${storyId}:h3`),
      Markup.button.callback("+8 часов", `story:schedule_quick:${storyId}:h8`),
    ],
    [Markup.button.callback("+1 день", `story:schedule_quick:${storyId}:d1`)],
    [Markup.button.callback("✍️ Ввести вручную", `story:schedule_manual:${storyId}`)],
    [Markup.button.callback("↩︎ Назад", `story:back_to_choice:${storyId}`)],
  ]);
}

async function renderScheduleMenu(ctx: MyContext, storyId: string, hint?: string) {
  const s = (await Story.findById(storyId).lean()) as any | null;
  if (!s) {
    return safeEdit(
      ctx,
      "История не найдена.",
      Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админку", "admin")]]),
      "HTML"
    );
  }

  if (s.isPublished) {
    return safeEdit(
      ctx,
      "Эта история уже опубликована. Планирование недоступно.",
      Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ Назад", `story:back_to_choice:${storyId}`)],
        [Markup.button.callback("↩︎ В админку", "admin")],
      ]),
      "HTML"
    );
  }

  const title = s?.title ? html(String(s.title)) : "история";
  const when = s.publishAt ? formatDtLocal(new Date(s.publishAt)) : "не задано";

  const text =
    (hint ? `${hint}\n\n` : "") +
    `⏱ <b>Планирование публикации</b>\n\n` +
    `История: <b>${title}</b>\n` +
    `Текущее время публикации: <b>${when}</b>\n\n` +
    `Нажимайте кнопки несколько раз — время будет <b>прибавляться</b>.\n` +
    `Пример: 45 мин = 3× “+15 мин”.\n` +
    `Пример: завтра в это же время +30 мин = “+1 день” → “+30 мин”.`;

  return safeEdit(ctx, text, scheduleMenuKb(storyId), "HTML");
}


function parsePublishAt(input: string, now = new Date()): Date | null {
  const s = (input ?? "").trim();

  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    const dt = new Date(now);
    dt.setHours(hh, mm, 0, 0);
    return dt;
  }

  m = s.match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const dd = Number(m[1]);
    const mon = Number(m[2]);
    const hh = Number(m[3]);
    const mm = Number(m[4]);
    if (mon < 1 || mon > 12 || dd < 1 || dd > 31) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    const year = now.getFullYear();
    const dt = new Date(year, mon - 1, dd, hh, mm, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const dd = Number(m[1]);
    const mon = Number(m[2]);
    const yyyy = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    if (mon < 1 || mon > 12 || dd < 1 || dd > 31) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    if (yyyy < 2000 || yyyy > 2100) return null;

    const dt = new Date(yyyy, mon - 1, dd, hh, mm, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  return null;
}

export function registerDraftFinishHandlers(bot: Telegraf<MyContext>) {
  bot.action("draft:cancel_input", async (ctx) => {
    await ctx.answerCbQuery();
    aggReset(ctx.state.user!.tgId);
    await resetPending(ctx.state.user!.tgId);

    const payload = await renderAddStoryTextScreen(ctx);
    await safeEdit(ctx, payload.text, payload.inline as any, "HTML");
  });

  bot.action("draft:finish_input", async (ctx) => {
    await ctx.answerCbQuery();

    const tgId = ctx.state.user!.tgId;
    const d = await getOrCreateDraft(tgId);

    if (!d.pendingInput) {
      const payload = await renderAddStoryTextScreen(ctx);
      return safeEdit(ctx, payload.text, payload.inline as any, "HTML");
    }

    const fin = aggFinalize(tgId);
    if (!fin) {
      const payload = await renderAddStoryTextScreen(ctx);
      return safeEdit(
        ctx,
        payload.text + "\n\n<i>Ввод прерван, ничего не сохранено.</i>",
        payload.inline as any,
        "HTML"
      );
    }

    const text = fin.text.trim();

    let err: string | null = null;
    let afterStoryId: string | null = null;

    try {
      const p = d.pendingInput as any;

      if (p.kind === "title") {
        if (text.length < 3 || text.length > 200)
          throw new Error("Заголовок 3..200 символов");
        await setField(tgId, "title", text);
      } else if (p.kind === "intro") {
        if (text.length < 10) throw new Error("Вступление слишком короткое");
        await setField(tgId, "intro", text);
      } else if (p.kind === "endingTitle") {
        if (text.length < 3 || text.length > 200)
          throw new Error("Заголовок концовки 3..200 символов");
        await setEndingTitle(tgId, p.index, text);
      } else if (p.kind === "endingText") {
        if (text.length < 5) throw new Error("Текст концовки слишком короткий");
        await setEndingText(tgId, p.index, text);
      } else if (p.kind === "publishAt") {
        const storyId = String(p.storyId ?? "");
        if (!storyId) throw new Error("Не найден storyId для планирования");

        const dt = parsePublishAt(text, new Date());
        if (!dt) {
          throw new Error("Не понял формат. Пример: 18:30 или 05.02 09:15");
        }

        const now = new Date();
        if (/^\d{1,2}:\d{2}$/.test(text) && dt.getTime() <= now.getTime()) {
          dt.setDate(dt.getDate() + 1);
        }


        if (dt.getTime() < now.getTime() + 30_000) {
          throw new Error("Время должно быть в будущем (хотя бы через 1 минуту).");
        }

        await Story.updateOne(
          { _id: storyId, isPublished: false },
          { $set: { publishAt: dt }, $unset: { publishedAt: "" } }
        );

        afterStoryId = storyId;
      }

      await resetPending(tgId);
    } catch (e: any) {
      logTelegramError("addStoryText.finish.validate", e);
      err = e?.message ?? "Неизвестная ошибка";
    }

    await tryDeleteUserMessagesHard(ctx, fin.chatId, fin.msgIds);

    aggReset(tgId);

    if (afterStoryId) {
      if (err) {
        return renderScheduleMenu(
          ctx,
          afterStoryId,
          `❌ Ошибка: <b>${html(err)}</b>`
        );
      }
      return renderScheduleMenu(
        ctx,
        afterStoryId,
        `✅ Время сохранено.`
      );
    }

    const payload = await renderAddStoryTextScreen(ctx);
    const postfix = err ? `Ошибка: ${html(err)}` : "Готово: сохранено.";
    await safeEdit(ctx, `${payload.text}\n\n${postfix}`, payload.inline as any, "HTML");
  });
}
