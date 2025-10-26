import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { isAdmin } from "../../shared/utils.js";
import { Markup } from "telegraf";
import { clearDraft, getDraft, setDraftUiMessageId, clearDraftUiMessageId } from "./broadcast.state.js";
import { changeDraft, onDraftText, startBroadcastDraft } from "../../app/ui/screens.adminBroadcast.js";
import { sendBroadcast } from "./broadcast.service.js";
import { respond } from "../../app/ui/respond.js";
import { getLastMessageId } from "../../app/middlewares/singleMessage.js";
import { logTelegramError } from "../../shared/logger.js";

export function registerBroadcastActions(bot: Telegraf<MyContext>) {
  bot.action("admin:broadcast", async (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();

    const view = startBroadcastDraft(ctx);
    try {
      await respond(ctx, view.text, { parseMode: view.parseMode, inline: view.inline as any });
    } catch (e) { logTelegramError("broadcast.start.respond", e); }
    const chatId = ctx.chat?.id;
    if (chatId) {
      const last = getLastMessageId(chatId);
      if (last) setDraftUiMessageId(ctx.state.user.tgId, last);
    }
  });

  bot.on("text", async (ctx, next) => {
    const u = ctx.state.user;
    if (!u || !isAdmin(u) || !getDraft(u.tgId)) return next();

    const chatId = ctx.chat?.id;
    const msgId = (ctx.message as any)?.message_id;
    if (chatId && msgId) { ctx.telegram.deleteMessage(chatId, msgId).catch(() => {}); }

    const view = onDraftText(ctx);
    try {
      await respond(ctx, view.text, { parseMode: view.parseMode, inline: view.inline as any });
    } catch (e) { logTelegramError("broadcast.onText.respond", e); }
    if (chatId) {
      const last = getLastMessageId(chatId);
      if (last) setDraftUiMessageId(u.tgId, last);
    }
  });

  bot.action(/^broadcast:(type|aud|ttl):(.+)$/, async (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return ctx.answerCbQuery();
    const [, kind, val] = ctx.match as RegExpMatchArray;
    const view = changeDraft(ctx, kind as any, val);
    await ctx.answerCbQuery();

    try {
      await respond(ctx, view.text, { parseMode: view.parseMode, inline: view.inline as any });
    } catch (e) { logTelegramError("broadcast.change.respond", e); }
    const chatId = ctx.chat?.id;
    if (chatId) {
      const last = getLastMessageId(chatId);
      if (last) setDraftUiMessageId(ctx.state.user.tgId, last);
    }
  });

  bot.action("broadcast:cancel", async (ctx) => {
    const u = ctx.state.user;
    if (!u) return ctx.answerCbQuery();
    clearDraft(u.tgId);
    await ctx.answerCbQuery();

    try {
      await respond(ctx, "Рассылка отменена.", { inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню", "admin")]]) as any });
    } catch (e) { logTelegramError("broadcast.cancel.respond", e); }

    const chatId = ctx.chat?.id;
    if (chatId) {
      const last = getLastMessageId(chatId);
      if (last) setDraftUiMessageId(u.tgId, last);
    }
    clearDraftUiMessageId(u.tgId);
  });

  bot.action("broadcast:send", async (ctx) => {
    const u = ctx.state.user;
    if (!u || !isAdmin(u)) return ctx.answerCbQuery();
    const d = getDraft(u.tgId);
    if (!d?.text) { await ctx.answerCbQuery("Нет текста"); return; }
    await ctx.answerCbQuery("Отправляю…");

    const report = await sendBroadcast(ctx.telegram, {
      text: d.text,
      type: d.type,
      audience: d.audience,
      ttlSec: d.ttlSec,
      createdByTgId: u.tgId,
    });

    clearDraft(u.tgId);
    const summary = `Готово.\nОтправлено: ${report.ok}/${report.total}\nОшибок: ${report.fail}\nУдаление запланировано: ${Math.round(((d?.ttlSec) || 0) / 60)} мин.`;
    try {
      await respond(ctx, summary, { inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню", "admin")]]) as any });
    } catch (e) { logTelegramError("broadcast.send.respond", e); }

    const chatId = ctx.chat?.id;
    if (chatId) {
      const last = getLastMessageId(chatId);
      if (last) setDraftUiMessageId(u.tgId, last);
    }
    clearDraftUiMessageId(u.tgId);
  });
}
