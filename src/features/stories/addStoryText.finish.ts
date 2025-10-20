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

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function updateMenu(ctx: MyContext, text: string, inline?: any) {
  const kb = inline?.reply_markup
    ? inline
    : inline
    ? { reply_markup: inline }
    : undefined;
  try {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } catch {
    const sent = await ctx.reply(text, { parse_mode: "HTML", ...kb });
    (ctx.state as any)?.rememberMessageId?.(sent.message_id);
  }
}

export function registerDraftFinishHandlers(bot: Telegraf<MyContext>) {
  bot.action("draft:cancel_input", async (ctx) => {
    await ctx.answerCbQuery();
    aggReset(ctx.state.user!.tgId);
    await resetPending(ctx.state.user!.tgId);
    const payload = await renderAddStoryTextScreen(ctx);
    await updateMenu(ctx, payload.text, payload.inline);
  });

  bot.action("draft:finish_input", async (ctx) => {
    await ctx.answerCbQuery();

    const tgId = ctx.state.user!.tgId;
    const d = await getOrCreateDraft(tgId);
    if (!d.pendingInput) {
      const payload = await renderAddStoryTextScreen(ctx);
      return updateMenu(ctx, payload.text, payload.inline);
    }

    const fin = aggFinalize(tgId);
    if (!fin) {
      const payload = await renderAddStoryTextScreen(ctx);
      return updateMenu(
        ctx,
        payload.text + "\n\n<i>Нет текста для сохранения.</i>",
        payload.inline
      );
    }

    const text = fin.text.trim();

    let err: string | null = null;
    try {
      const p = d.pendingInput as any;
      if (p.kind === "title") {
        if (text.length < 3 || text.length > 200)
          throw new Error("Название 3..200 символов");
        await setField(tgId, "title", text);
      } else if (p.kind === "intro") {
        if (text.length < 10) throw new Error("Начало слишком короткое");
        await setField(tgId, "intro", text);
      } else if (p.kind === "endingTitle") {
        if (text.length < 3 || text.length > 200)
          throw new Error("Название продолжения 3..200 символов");
        await setEndingTitle(tgId, p.index, text);
      } else if (p.kind === "endingText") {
        if (text.length < 5)
          throw new Error("Текст продолжения слишком короткий");
        await setEndingText(tgId, p.index, text);
      }
      await resetPending(tgId);
    } catch (e: any) {
      err = e?.message ?? "Ошибка валидации";
    }

    await tryDeleteUserMessagesHard(ctx, fin.chatId, fin.msgIds);

    aggReset(tgId);
    const payload = await renderAddStoryTextScreen(ctx);
    const postfix = err ? `❌ ${html(err)}` : "✅ Сохранено.";
    await updateMenu(ctx, `${payload.text}\n\n${postfix}`, payload.inline);
  });
}
