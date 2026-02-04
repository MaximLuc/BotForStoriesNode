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

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

    try {
      const p = d.pendingInput as any;

      if (p.kind === "title") {
        if (text.length < 3 || text.length > 200) throw new Error("Заголовок 3..200 символов");
        await setField(tgId, "title", text);
      } else if (p.kind === "intro") {
        if (text.length < 10) throw new Error("Вступление слишком короткое");
        await setField(tgId, "intro", text);
      } else if (p.kind === "endingTitle") {
        if (text.length < 3 || text.length > 200) throw new Error("Заголовок концовки 3..200 символов");
        await setEndingTitle(tgId, p.index, text);
      } else if (p.kind === "endingText") {
        if (text.length < 5) throw new Error("Текст концовки слишком короткий");
        await setEndingText(tgId, p.index, text);
      }

      await resetPending(tgId);
    } catch (e: any) {
      logTelegramError("addStoryText.finish.validate", e);
      err = e?.message ?? "Неизвестная ошибка";
    }

    await tryDeleteUserMessagesHard(ctx, fin.chatId, fin.msgIds);
    aggReset(tgId);

    const payload = await renderAddStoryTextScreen(ctx);
    const postfix = err ? `Ошибка: ${html(err)}` : "Готово: сохранено.";
    await safeEdit(ctx, `${payload.text}\n\n${postfix}`, payload.inline as any, "HTML");
  });
}
