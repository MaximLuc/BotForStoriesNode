import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";

import {
  getOrCreateDraft,
  setPending,
  resetPending,
  setField,
  setEndingTitle,
  setEndingText,
  removeEnding,
  commitDraftToStory,
  canCreate,
  setStoryPrice,
} from "./draft.service.js";

import type { DraftEnding } from "../../db/models/DraftStory.js";
import { renderAddStoryTextScreen } from "../../app/ui/screens.addStoryText.js";
import { safeEdit } from "../../app/ui/respond.js";
import { logError } from "../../shared/logger.js";
import { aggStart } from "./input.aggregator.js";
import { Story } from "../../db/models/Story.js";

let ACTIONS_REGISTERED = false;

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function updateMenu(ctx: MyContext, text: string, inline?: any) {
  try {
    await safeEdit(ctx, text, inline, "HTML");
  } catch (e) {
    logError("addStoryText.updateMenu.safeEdit", e);
  }
}

async function renderForm(ctx: MyContext, hint?: string) {
  const payload = await renderAddStoryTextScreen(ctx);
  const text = hint ? `${payload.text}\n\n${hint}` : payload.text;
  await updateMenu(ctx, text, payload.inline);
}

function inputWaitKb(backCb = "admin:add_story_text") {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Сохранить ввод", "draft:finish_input")],
    [Markup.button.callback("✖ Отмена", "draft:cancel_input")],
    [Markup.button.callback("↩︎ Назад", backCb)],
  ]);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDtLocal(dt: Date) {
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)} ${pad(dt.getHours())}:${pad(
    dt.getMinutes()
  )}`;
}

function storyStatusLine(s: any | null | undefined) {
  if (!s) return "Статус: —";
  if (s.isPublished) {
    const dt = s.publishedAt ? formatDtLocal(new Date(s.publishedAt)) : "—";
    return `Статус: <b>опубликована</b> ✅\nОпубликовано: <b>${dt}</b>`;
  }
  if (s.publishAt) {
    return `Статус: <b>запланирована</b> ⏱\nПубликация: <b>${formatDtLocal(
      new Date(s.publishAt)
    )}</b>`;
  }
  return "Статус: <b>черновик</b> 📝";
}

async function renderPublishChoice(ctx: MyContext, storyId: string) {
  const s = (await Story.findById(storyId).lean()) as any | null;
  const title = s?.title ? html(String(s.title)) : "история";

  const text =
    `История: <b>${title}</b>\n` +
    `${storyStatusLine(s)}\n\n` +
    `Выберите способ публикации:`;

  const inline = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Опубликовать сейчас", `story:publish_now:${storyId}`)],
    [Markup.button.callback("⏱ Запланировать", `story:schedule_menu:${storyId}`)],
    [Markup.button.callback("🕐 Авто: через 1 минуту", `story:schedule_quick:${storyId}:m1`)],
    [Markup.button.callback("➕ Добавить обложку", `cover:add:${storyId}`)],
    [Markup.button.callback("↩︎ Сохранить и выйти", "admin")],
  ]);

  await updateMenu(ctx, text, inline);
}

function addMs(code: string) {
  switch (code) {
    case "m1":
      return 1 * 60_000;
    case "m5":
      return 5 * 60_000;
    case "m15":
      return 15 * 60_000;
    case "m30":
      return 30 * 60_000;
    case "h1":
      return 60 * 60_000;
    case "h3":
      return 3 * 60 * 60_000;
    case "h8":
      return 8 * 60 * 60_000;
    case "d1":
      return 24 * 60 * 60_000;
    default:
      return null;
  }
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

async function renderScheduleMenu(ctx: MyContext, storyId: string) {
  const s = (await Story.findById(storyId).lean()) as any | null;
  if (!s) {
    await updateMenu(
      ctx,
      "История не найдена.",
      Markup.inlineKeyboard([[Markup.button.callback("↩︎ Сохранить и выйти", "admin")]])
    );
    return;
  }

  if (s.isPublished) {
    await updateMenu(
      ctx,
      "Эта история уже опубликована. Планирование недоступно.",
      Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ Назад", `story:back_to_choice:${storyId}`)],
        [Markup.button.callback("↩︎ В админку", "admin")],
      ])
    );
    return;
  }

  const title = s?.title ? html(String(s.title)) : "история";
  const when = s.publishAt ? formatDtLocal(new Date(s.publishAt)) : "не задано";

  const text =
    `⏱ <b>Планирование публикации</b>\n\n` +
    `История: <b>${title}</b>\n` +
    `Текущее время публикации: <b>${when}</b>\n\n` +
    `Нажимайте кнопки несколько раз — время будет <b>прибавляться</b>.\n` +
    `Пример: 45 мин = 3× “+15 мин”.\n` +
    `Пример: завтра в это же время +30 мин = “+1 день” → “+30 мин”.`;

  await updateMenu(ctx, text, scheduleMenuKb(storyId));
}

export function registerAddStoryTextActions(bot: Telegraf<MyContext>) {
  if (ACTIONS_REGISTERED) return;
  ACTIONS_REGISTERED = true;

  bot.action("draft:set_title", async (ctx) => {
    const tgId = ctx.state.user!.tgId;
    await setPending(tgId, { kind: "title" });
    aggStart(tgId, ctx.chat!.id, "title");
    await ctx.answerCbQuery();
    await updateMenu(
      ctx,
      "Отправляйте название (можно частями). Когда закончите — нажмите <b>«Сохранить ввод»</b>.",
      inputWaitKb()
    );
  });

  bot.action("draft:ask_price_story", async (ctx) => {
    await setPending(ctx.state.user!.tgId, { kind: "priceStory" });
    await ctx.answerCbQuery();
    await renderForm(ctx);
  });

  bot.action(/^draft:price_story:(0|1|3|5)$/, async (ctx) => {
    const v = Number(ctx.match[1]);
    await setStoryPrice(ctx.state.user!.tgId, v as 0 | 1 | 3 | 5);
    await resetPending(ctx.state.user!.tgId);
    await ctx.answerCbQuery("Цена сохранена");
    await renderForm(ctx, `✅ Цена истории: ${v ? `${v} токен(ов)` : "бесплатно"}`);
  });

  bot.action("draft:cancel_price", async (ctx) => {
    await resetPending(ctx.state.user!.tgId);
    await ctx.answerCbQuery("Отменено");
    await renderForm(ctx);
  });

  bot.action("draft:set_intro", async (ctx) => {
    const tgId = ctx.state.user!.tgId;
    await setPending(tgId, { kind: "intro" });
    aggStart(tgId, ctx.chat!.id, "intro");
    await ctx.answerCbQuery();
    await updateMenu(
      ctx,
      "Отправляйте <b>начало истории</b> (можно частями). Когда закончите — нажмите <b>«Сохранить ввод»</b>.",
      inputWaitKb()
    );
  });

  bot.action(/^draft:set_end_title:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1]);
    const tgId = ctx.state.user!.tgId;
    await setPending(tgId, { kind: "endingTitle", index: i });
    aggStart(tgId, ctx.chat!.id, "endingTitle");
    await ctx.answerCbQuery();
    await updateMenu(
      ctx,
      `Отправляйте <b>название продолжения #${i + 1}</b>. Когда закончите — нажмите <b>«Сохранить ввод»</b>.`,
      inputWaitKb()
    );
  });

  bot.action(/^draft:set_end_text:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1]);
    const tgId = ctx.state.user!.tgId;
    await setPending(tgId, { kind: "endingText", index: i });
    aggStart(tgId, ctx.chat!.id, "endingText");
    await ctx.answerCbQuery();
    await updateMenu(
      ctx,
      `Отправляйте <b>текст продолжения #${i + 1}</b>. Когда закончите — нажмите <b>«Сохранить ввод»</b>.`,
      inputWaitKb()
    );
  });

  bot.action("draft:add_ending", async (ctx) => {
    const d = await getOrCreateDraft(ctx.state.user!.tgId);
    if (d.endings.length >= 3) {
      await ctx.answerCbQuery("Максимум 3 концовки");
      return;
    }
    const index = d.endings.length;
    await setPending(ctx.state.user!.tgId, { kind: "endingTitle", index });
    aggStart(ctx.state.user!.tgId, ctx.chat!.id, "endingTitle");
    await ctx.answerCbQuery();
    await updateMenu(
      ctx,
      `Введите <b>заголовок концовки #${index + 1}</b>. Можно частями. Потом нажмите <b>«Сохранить ввод»</b>.`,
      inputWaitKb()
    );
  });

  bot.action(/^draft:del_end:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1]);
    await removeEnding(ctx.state.user!.tgId, i);
    await ctx.answerCbQuery("Удалено");
    await renderForm(ctx);
  });

  bot.action("draft:commit", async (ctx) => {
    await ctx.answerCbQuery();
    const tgId = ctx.state.user!.tgId;

    try {
      const d = await getOrCreateDraft(tgId);
      const ready = canCreate({
        title: d.title ?? undefined,
        intro: d.intro ?? undefined,
        endings: d.endings as DraftEnding[],
      });

      if (!ready) {
        await updateMenu(
          ctx,
          "Не хватает данных для публикации. Проверьте: заголовок, вступление и хотя бы одну концовку.",
          Markup.inlineKeyboard([[{ text: "↩︎ Назад", callback_data: "admin" }]])
        );
        return;
      }

      const story = await commitDraftToStory(tgId);
      await renderPublishChoice(ctx, String(story._id));
    } catch (e) {
      console.error("[draft:commit] error:", e);
      await updateMenu(
        ctx,
        "Неизвестная ошибка сохранения. Попробуйте ещё раз.",
        Markup.inlineKeyboard([[{ text: "↩︎ Назад", callback_data: "admin" }]])
      );
    }
  });

  bot.action(/^story:back_to_choice:(.+)$/, async (ctx) => {
    const storyId = String(ctx.match[1]);
    await ctx.answerCbQuery();
    await renderPublishChoice(ctx, storyId);
  });

  bot.action(/^story:publish_now:(.+)$/, async (ctx) => {
    const storyId = String(ctx.match[1]);
    await ctx.answerCbQuery();

    const now = new Date();
    await Story.updateOne(
      { _id: storyId },
      { $set: { isPublished: true, publishedAt: now }, $unset: { publishAt: "" } }
    );

    await renderPublishChoice(ctx, storyId);
  });

  bot.action(/^story:schedule_menu:(.+)$/, async (ctx) => {
    const storyId = String(ctx.match[1]);
    await ctx.answerCbQuery();
    await renderScheduleMenu(ctx, storyId);
  });

  bot.action(/^story:schedule_quick:(.+):(.+)$/, async (ctx) => {
    const storyId = String(ctx.match[1]);
    const code = String(ctx.match[2]);
    await ctx.answerCbQuery();

    const delta = addMs(code);
    if (!delta) {
      await updateMenu(ctx, "Ошибка: неизвестный вариант планирования.", scheduleMenuKb(storyId));
      return;
    }

    const s = (await Story.findById(storyId).lean()) as any | null;
    if (!s) {
      await updateMenu(
        ctx,
        "История не найдена.",
        Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админку", "admin")]])
      );
      return;
    }
    if (s.isPublished) {
      await updateMenu(
        ctx,
        "Эта история уже опубликована. Планирование недоступно.",
        Markup.inlineKeyboard([[Markup.button.callback("↩︎ Назад", `story:back_to_choice:${storyId}`)]])
      );
      return;
    }

    const base = s.publishAt ? new Date(s.publishAt) : new Date();
    const next = new Date(base.getTime() + delta);

    await Story.updateOne(
      { _id: storyId, isPublished: false },
      { $set: { publishAt: next }, $unset: { publishedAt: "" } }
    );

    await renderScheduleMenu(ctx, storyId);
  });

  bot.action(/^story:schedule_manual:(.+)$/, async (ctx) => {
    const storyId = String(ctx.match[1]);
    const tgId = ctx.state.user!.tgId;

    await setPending(tgId, { kind: "publishAtDirect", storyId });

    await ctx.answerCbQuery();
    await updateMenu(
      ctx,
      "✍️ <b>Введите время публикации одним сообщением</b>.\n\n" +
        "Форматы:\n" +
        "• <b>HH:MM</b> (сегодня/если уже прошло — поставим на завтра)\n" +
        "• <b>DD.MM HH:MM</b>\n" +
        "• <b>DD.MM.YYYY HH:MM</b>\n\n" +
        "Пример: <b>18:30</b> или <b>05.02 09:15</b>\n\n" +
        "После отправки я сохраню и верну в меню подтверждения.",
      Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ Назад", `story:schedule_menu:${storyId}`)],
        [Markup.button.callback("✖ Отмена", `story:cancel_manual:${storyId}`)],
      ])
    );
  });

  bot.action(/^story:cancel_manual:(.+)$/, async (ctx) => {
    const storyId = String(ctx.match[1]);
    await ctx.answerCbQuery();
    await resetPending(ctx.state.user!.tgId);
    await renderScheduleMenu(ctx, storyId);
  });
}
