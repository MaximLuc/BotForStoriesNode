﻿import type { Telegraf } from "telegraf";
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
  setEndingAccess,
  setStoryAccess,
} from "./draft.service.js";
import type { DraftEnding } from "../../db/models/DraftStory.js";
import { renderAddStoryTextScreen } from "../../app/ui/screens.addStoryText.js";
import { getLastMessageId } from "../../app/middlewares/singleMessage.js";
import { safeEdit } from "../../app/ui/respond.js";
import { logError } from "../../shared/logger.js";
import { isAdmin } from "../../shared/utils.js";
import { aggStart } from "./input.aggregator.js";

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

function inputWaitKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Сохранить ввод", "draft:finish_input")],
    [Markup.button.callback("✖ Отмена", "draft:cancel_input")],
    [Markup.button.callback("↩︎ Назад", "admin:add_story_text")],
  ]);
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
      "Отправляйте название (можно частями). Когда закончите — нажмите <b>«Готово»</b>.",
      inputWaitKb()
    );
  });

  bot.action("draft:set_intro", async (ctx) => {
    const tgId = ctx.state.user!.tgId;
    await setPending(tgId, { kind: "intro" });
    aggStart(tgId, ctx.chat!.id, "intro");
    await ctx.answerCbQuery();
    await updateMenu(
      ctx,
      "Отправляйте <b>начало истории</b> (можно частями). Когда закончите — нажмите <b>«Готово»</b>.",
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
      `Отправляйте <b>название продолжения #${
        i + 1
      }</b>. Нажмите <b>«Готово»</b>, когда закончите.`,
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
      `Отправляйте <b>текст продолжения #${
        i + 1
      }</b>. Нажмите <b>«Готово»</b>, когда закончите.`,
      inputWaitKb()
    );
  });

  bot.action("draft:ask_access_story", async (ctx) => {
    await setPending(ctx.state.user!.tgId, { kind: "accessStory" });
    await ctx.answerCbQuery();
    await renderForm(ctx);
  });

  bot.action("draft:access_story:all", async (ctx) => {
    await setStoryAccess(ctx.state.user!.tgId, 0);
    await resetPending(ctx.state.user!.tgId);
    await ctx.answerCbQuery("Доступ: всем");
await renderForm(ctx, "Готово: доступ к истории: всем");
  });
  bot.action("draft:access_story:premium", async (ctx) => {
    await setStoryAccess(ctx.state.user!.tgId, 1);
    await resetPending(ctx.state.user!.tgId);
    await ctx.answerCbQuery("Доступ: для подписчиков");
await renderForm(ctx, "Готово: доступ к истории: подписчики");
  });

  bot.action(/^draft:ask_end_access:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1]);
    await setPending(ctx.state.user!.tgId, { kind: "accessEnding", index: i });
    await ctx.answerCbQuery();
    await renderForm(ctx);
  });

  bot.action(/^draft:end_access_set:(\d+):all$/, async (ctx) => {
    const i = Number(ctx.match[1]);
    await setEndingAccess(ctx.state.user!.tgId, i, 0);
    await resetPending(ctx.state.user!.tgId);
    await ctx.answerCbQuery("Доступ окончания: всем");
    await renderForm(ctx, `✅ Доступ к продолжению #${i + 1}: всем`);
  });
  bot.action(/^draft:end_access_set:(\d+):premium$/, async (ctx) => {
    const i = Number(ctx.match[1]);
    await setEndingAccess(ctx.state.user!.tgId, i, 1);
    await resetPending(ctx.state.user!.tgId);
    await ctx.answerCbQuery("Доступ окончания: премиум");
    await renderForm(ctx, `✅ Доступ к продолжению #${i + 1}: премиум`);
  });

  bot.action("draft:cancel_access", async (ctx) => {
    await resetPending(ctx.state.user!.tgId);
    await ctx.answerCbQuery("Отменено");
await renderForm(ctx);
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
      `Введите <b>заголовок концовки #${index + 1}</b>. Отправьте одно сообщение с <b>названием</b>.`,
      inputWaitKb()
    );
  });

  bot.action(/^draft:del_end:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1]);
    await removeEnding(ctx.state.user!.tgId, i);
    await ctx.answerCbQuery("Отменено");
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
        await updateMenu(ctx, "Не хватает данных для публикации. Проверьте: заголовок, вступление и хотя бы одну концовку.", Markup.inlineKeyboard([[{ text: "↩︎ Назад", callback_data: "admin" }]]));
        return;
      }

      const story = await commitDraftToStory(tgId);
      await updateMenu(ctx, `Готово: история создана: <b>${html(story.title)}</b> (концовок: ${story.endings.length})`, Markup.inlineKeyboard([[{ text: "➕ Добавить обложку", callback_data: `cover:add:${story._id}` }],[{ text: "↩︎ В админку", callback_data: "admin" }]]));
    } catch (e) {
      console.error("[draft:commit] error:", e);
      await updateMenu(ctx, "Неизвестная ошибка сохранения. Попробуйте ещё раз.", Markup.inlineKeyboard([[{ text: "↩︎ Назад", callback_data: "admin" }]]));
    }
  });
}


