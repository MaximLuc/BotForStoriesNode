import type { Telegraf } from "telegraf"
import type { MyContext } from "../../shared/types"
import { isAdmin } from "../../shared/utils"
import { Markup } from "telegraf"
import {
  clearDraft, getDraft, setDraftUiMessageId, getDraftUiMessageId, clearDraftUiMessageId
} from "./broadcast.state"
import {
  changeDraft, onDraftText, renderBroadcastPreview, startBroadcastDraft
} from "../../app/ui/screens.adminBroadcast"
import { sendBroadcast } from "./broadcast.service"

function ensureMarkup(m?: ReturnType<typeof Markup.inlineKeyboard>) {
  return m?.reply_markup ? { reply_markup: m.reply_markup } : {}
}

export function registerBroadcastActions(bot: Telegraf<MyContext>) {

  bot.action("admin:broadcast", async (ctx) => {
  if (!ctx.state.user || !isAdmin(ctx.state.user)) return ctx.answerCbQuery()
  await ctx.answerCbQuery()

  const view = startBroadcastDraft(ctx)

  try {
    await ctx.editMessageText(view.text, { parse_mode: view.parseMode, ...ensureMarkup(view.inline) })
    const msg: any = ctx.callbackQuery && "message" in ctx.callbackQuery ? (ctx.callbackQuery as any).message : undefined
    if (msg?.message_id) setDraftUiMessageId(ctx.state.user.tgId, msg.message_id)
    return
  } catch {
    const sent = await (ctx.state as any).sendSingle(view.text, { parse_mode: view.parseMode, ...ensureMarkup(view.inline) })
    setDraftUiMessageId(ctx.state.user.tgId, sent.message_id)
  }
})

  bot.on("text", async (ctx, next) => {
    const u = ctx.state.user
    if (!u || !isAdmin(u) || !getDraft(u.tgId)) return next()

    const chatId = ctx.chat?.id
    const msgId = (ctx.message as any)?.message_id
    if (chatId && msgId) { ctx.telegram.deleteMessage(chatId, msgId).catch(() => {}) }

    const view = onDraftText(ctx)
    const uiMsgId = getDraftUiMessageId(u.tgId)
    if (chatId && uiMsgId) {
      await ctx.telegram.editMessageText(chatId, uiMsgId, undefined, view.text, {
        parse_mode: view.parseMode,
        ...ensureMarkup(view.inline),
      }).catch(async () => {
        const sent = await ctx.reply(view.text, { parse_mode: view.parseMode, ...ensureMarkup(view.inline) })
        setDraftUiMessageId(u.tgId, sent.message_id)
        try { await ctx.telegram.deleteMessage(chatId, uiMsgId) } catch {}
      })

      setTimeout(async () => {
        try {
          const latestId = getDraftUiMessageId(u.tgId)
          if (!latestId) return
          await ctx.telegram.editMessageText(chatId!, latestId, undefined, view.text, {
            parse_mode: view.parseMode,
            ...ensureMarkup(view.inline),
          })
        } catch {}
      }, 5000)
    }
  })

  bot.action(/^broadcast:(type|aud|ttl):(.+)$/, async (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return ctx.answerCbQuery()
    const [, kind, val] = ctx.match as RegExpMatchArray
    const view = changeDraft(ctx, kind as any, val)
    await ctx.answerCbQuery()

    const chatId = ctx.chat?.id
    const uiMsgId = getDraftUiMessageId(ctx.state.user.tgId)
    if (chatId && uiMsgId) {
      await ctx.telegram.editMessageText(chatId, uiMsgId, undefined, view.text, {
        parse_mode: view.parseMode,
        ...ensureMarkup(view.inline),
      }).catch(() => {})
    }
  })

  bot.action("broadcast:cancel", async (ctx) => {
    const u = ctx.state.user
    if (!u) return ctx.answerCbQuery()
    clearDraft(u.tgId); await ctx.answerCbQuery("Отменено")

    const chatId = ctx.chat?.id
    const uiMsgId = getDraftUiMessageId(u.tgId)
    if (chatId && uiMsgId) {
      await ctx.telegram.editMessageText(chatId, uiMsgId, undefined, "Рассылка отменена.", {
        ...ensureMarkup(Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню","admin")]])),
      }).catch(() => {})
      clearDraftUiMessageId(u.tgId)
    }
  })

  bot.action("broadcast:send", async (ctx) => {
    const u = ctx.state.user
    if (!u || !isAdmin(u)) return ctx.answerCbQuery()
    const d = getDraft(u.tgId)
    if (!d?.text) { await ctx.answerCbQuery("Нет текста"); return }

    await ctx.answerCbQuery("Отправляю…")

    const report = await sendBroadcast(ctx.telegram, {
      text: d.text,
      type: d.type,
      audience: d.audience,
      ttlSec: d.ttlSec,
      createdByTgId: u.tgId,
    })

    const chatId = ctx.chat?.id
    const uiMsgId = getDraftUiMessageId(u.tgId)
    clearDraft(u.tgId)

    const summary =
`Готово.
Отправлено: ${report.ok}/${report.total}
Ошибок: ${report.fail}
Удаление запланировано: ${Math.round((d.ttlSec||0)/60)} мин.`

    if (chatId && uiMsgId) {
      await ctx.telegram.editMessageText(chatId, uiMsgId, undefined, summary, {
        ...ensureMarkup(Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню","admin")]])),
      }).catch(async () => {
        const sent = await ctx.reply(summary, ensureMarkup(Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню","admin")]])))
        setDraftUiMessageId(u.tgId, sent.message_id)
        try { await ctx.telegram.deleteMessage(chatId, uiMsgId) } catch {}
      })
      clearDraftUiMessageId(u.tgId)
    }
  })
}
