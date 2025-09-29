import { Markup } from 'telegraf'
import type { MyContext } from '../../shared/types'
import type { UserDoc } from '../../db/models/User'
import { buildReplyMain } from './menus'

function isCallback(ctx: MyContext) {
  return 'callback_query' in ctx.update
}

async function safeEdit(ctx: MyContext, text: string, inline?: ReturnType<typeof Markup.inlineKeyboard>) {
  const msg = (ctx.callbackQuery && 'message' in ctx.callbackQuery) ? ctx.callbackQuery.message : undefined
  const currentText = (msg && 'text' in msg) ? (msg as any).text : undefined
  const currentMarkup = (msg as any)?.reply_markup
  const newMarkup = inline?.reply_markup

  if (currentText === text && JSON.stringify(currentMarkup) === JSON.stringify(newMarkup)) {
    await ctx.answerCbQuery().catch(() => {})
    return
  }
  try {
    await ctx.editMessageText(text, inline)
  } catch (e: any) {
    const d = e?.response?.description || ''
    if (/message is not modified/i.test(d)) {
      await ctx.answerCbQuery().catch(() => {})
      return
    }
    throw e
  }
}

type RespondOpts = {
  inline?: ReturnType<typeof Markup.inlineKeyboard>
  setReplyKeyboard?: boolean
  replyNoticeText?: string
}

export async function respond(ctx: MyContext, text: string, opts?: RespondOpts) {
  if (opts?.setReplyKeyboard) {
    const kb = buildReplyMain(ctx.state.user).resize().persistent()
    // await ctx.reply(opts.replyNoticeText ?? 'Меню обновлено', kb).catch(() => {})
  }

  if (isCallback(ctx)) {
    await ctx.answerCbQuery().catch(() => {})
    return safeEdit(ctx, text, opts?.inline)
  }
  return (ctx.state as any).sendSingle(text, opts?.inline)
}

