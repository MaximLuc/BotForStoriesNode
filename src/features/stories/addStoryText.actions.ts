import type { Telegraf } from 'telegraf'
import type { MyContext } from '../../shared/types'
import { Markup } from 'telegraf'
import {
  getOrCreateDraft, setPending, resetPending,
  setField, setEndingTitle, setEndingText, removeEnding,
  commitDraftToStory, canCreate,
  setEndingAccess,
  setStoryAccess
} from './draft.service'
import type { DraftEnding } from '../../db/models/DraftStory'
import { renderAddStoryTextScreen } from '../../app/ui/screens.addStoryText'
import { getLastMessageId } from '../../app/middlewares/singleMessage'
import { isAdmin } from '../../shared/utils'

let ACTIONS_REGISTERED = false

async function updateMenu(ctx: MyContext, text: string, inline?: any) {
  const kb = inline ? (inline.reply_markup ? inline : { reply_markup: inline }) : undefined
  if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb })
    return
  }
  const chatId = ctx.chat?.id
  if (chatId) {
    const lastId = getLastMessageId(chatId)
    if (lastId) {
      try {
        await ctx.telegram.editMessageText(chatId, lastId, undefined, text, { parse_mode: 'Markdown', ...kb })
        return
      } catch {}
    }
  }
  const sent = await ctx.reply(text, { parse_mode: 'Markdown', ...kb })
  ;(ctx.state as any)?.rememberMessageId?.(sent.message_id)
}

async function renderForm(ctx: MyContext, hint?: string) {
  const payload = await renderAddStoryTextScreen(ctx)
  const text = hint ? `${payload.text}\n\n${hint}` : payload.text
  await updateMenu(ctx, text, payload.inline)
}

async function tryDeleteUserMessages(ctx: MyContext) {
  const msg: any = ctx.message
  const multi: number[] | undefined = (ctx.state as any)._mergedMsgIds
  if (Array.isArray(multi)) {
    for (const id of multi) {
      try { await ctx.deleteMessage(id) } catch {}
    }
  } else if (msg?.message_id) {
    try { await ctx.deleteMessage(msg.message_id) } catch {}
  }
  ;(ctx.state as any)._mergedMsgIds = undefined
}

export function registerAddStoryTextActions(bot: Telegraf<MyContext>) {
  if (ACTIONS_REGISTERED) return
  ACTIONS_REGISTERED = true

  bot.action('draft:set_title', async (ctx) => {
    await setPending(ctx.state.user!.tgId, { kind: 'title' })
    await ctx.answerCbQuery()
    await renderForm(ctx, '➡️ Задайте *название истории*.')
  })

  bot.action('draft:set_intro', async (ctx) => {
    await setPending(ctx.state.user!.tgId, { kind: 'intro' })
    await ctx.answerCbQuery()
    await renderForm(ctx, '➡️ Отправьте *начало истории*.')
  })

  bot.action(/^draft:set_end_title:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1])
    await setPending(ctx.state.user!.tgId, { kind: 'endingTitle', index: i })
    await ctx.answerCbQuery()
    await renderForm(ctx, `➡️ Задайте *название продолжения #${i + 1}*.`)
  })

  bot.action(/^draft:set_end_text:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1])
    await setPending(ctx.state.user!.tgId, { kind: 'endingText', index: i })
    await ctx.answerCbQuery()
    await renderForm(ctx, `➡️ Отправьте *текст продолжения #${i + 1}*.`)
  })

  bot.action('draft:ask_access_story', async (ctx) => {
    await setPending(ctx.state.user!.tgId, { kind: 'accessStory' })
    await ctx.answerCbQuery()
    await renderForm(ctx)
  })

  bot.action('draft:access_story:all', async (ctx) => {
    await setStoryAccess(ctx.state.user!.tgId, 0)
    await resetPending(ctx.state.user!.tgId)
    await ctx.answerCbQuery('Доступ: всем')
    await renderForm(ctx, '✅ Доступ к истории: всем')
  })
  bot.action('draft:access_story:premium', async (ctx) => {
    await setStoryAccess(ctx.state.user!.tgId, 1)
    await resetPending(ctx.state.user!.tgId)
    await ctx.answerCbQuery('Доступ: только с подпиской')
    await renderForm(ctx, '✅ Доступ к истории: премиум')
  })

  bot.action(/^draft:ask_end_access:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1])
    await setPending(ctx.state.user!.tgId, { kind: 'accessEnding', index: i })
    await ctx.answerCbQuery()
    await renderForm(ctx)
  })

  bot.action(/^draft:end_access_set:(\d+):all$/, async (ctx) => {
    const i = Number(ctx.match[1])
    await setEndingAccess(ctx.state.user!.tgId, i, 0)
    await resetPending(ctx.state.user!.tgId)
    await ctx.answerCbQuery('Доступ окончания: всем')
    await renderForm(ctx, `✅ Доступ к продолжению #${i+1}: всем`)
  })
  bot.action(/^draft:end_access_set:(\d+):premium$/, async (ctx) => {
    const i = Number(ctx.match[1])
    await setEndingAccess(ctx.state.user!.tgId, i, 1)
    await resetPending(ctx.state.user!.tgId)
    await ctx.answerCbQuery('Доступ окончания: премиум')
    await renderForm(ctx, `✅ Доступ к продолжению #${i+1}: премиум`)
  })

  bot.action('draft:cancel_access', async (ctx) => {
    await resetPending(ctx.state.user!.tgId)
    await ctx.answerCbQuery('Отменено')
    await renderForm(ctx)
  })

  bot.action('draft:add_ending', async (ctx) => {
    const d = await getOrCreateDraft(ctx.state.user!.tgId)
    if (d.endings.length >= 3) {
      await ctx.answerCbQuery('Максимум 3 продолжения')
      return
    }
    const index = d.endings.length
    await setPending(ctx.state.user!.tgId, { kind: 'endingTitle', index })
    await ctx.answerCbQuery()
    await renderForm(ctx, `➡️ Задайте *название продолжения #${index + 1}*.`)
  })

  bot.action(/^draft:del_end:(\d+)$/, async (ctx) => {
    const i = Number(ctx.match[1])
    await removeEnding(ctx.state.user!.tgId, i)
    await ctx.answerCbQuery('Удалено')
    await renderForm(ctx)
  })

  bot.action('draft:commit', async (ctx) => {
    await ctx.answerCbQuery()
    const tgId = ctx.state.user!.tgId
    try {
      const d = await getOrCreateDraft(tgId)
      const ready = canCreate({
        title: d.title ?? undefined,
        intro: d.intro ?? undefined,
        endings: d.endings as DraftEnding[],
      })
      if (!ready) {
        await updateMenu(
          ctx,
          'Черновик заполнен не полностью. Нужны: название, начало и хотя бы одно продолжение.',
          Markup.inlineKeyboard([[{ text: '⬅️ Назад', callback_data: 'admin' }]])
        )
        return
      }

      const story = await commitDraftToStory(tgId)
      const okId = String(story._id)
      console.log('[draft:commit] created story _id=', okId)
      await updateMenu(
        ctx,
        `✅ История добавлена: *${story.title}* (окон. ${story.endings.length})`,
        Markup.inlineKeyboard([
          [{ text: '🌌ОБЛОЖКА🌌', callback_data:`cover:add:${story._id}`}],
          [{ text: '⬅️ В админ-меню', callback_data: 'admin' }],
        ])
      )
    } catch (e) {
      console.error('[draft:commit] error:', e)
      await updateMenu(
        ctx,
        'Ошибка при сохранении истории. Попробуйте ещё раз.',
        Markup.inlineKeyboard([[{ text: '⬅️ Назад', callback_data: 'admin' }]])
      )
    }
  })
}

export async function registerDraftTextCatcher(bot: Telegraf<MyContext>) {
  bot.on('message', async (ctx, next) => {
    const u = ctx.state.user
    if (!u || !isAdmin(u)) return next()

    const merged: string | undefined = (ctx.state as any)._mergedText
    const msg: any = ctx.message
    const fallback: string | undefined =
      typeof msg?.text === 'string' ? msg.text.trim()
      : (typeof msg?.caption === 'string' ? msg.caption.trim() : undefined)

    const text: string | undefined = merged?.trim() || fallback
    if (!text) return next()

    const d = await getOrCreateDraft(u.tgId)
    if (!d.pendingInput) return next()

    let err: string | null = null
    try {
      const p = d.pendingInput as any
      if (p.kind === 'title') {
        if (text.length < 3 || text.length > 200) throw new Error('Название 3..200 символов')
        await setField(u.tgId, 'title', text)
      } else if (p.kind === 'intro') {
        if (text.length < 10) throw new Error('Начало слишком короткое')
        await setField(u.tgId, 'intro', text)
      } else if (p.kind === 'endingTitle') {
        if (text.length < 3 || text.length > 200) throw new Error('Название продолжения 3..200 символов')
        await setEndingTitle(u.tgId, p.index, text)
      } else if (p.kind === 'endingText') {
        if (text.length < 5) throw new Error('Текст продолжения слишком короткий')
        await setEndingText(u.tgId, p.index, text)
      }
      await resetPending(u.tgId)
    } catch (e: any) {
      err = e?.message ?? 'Ошибка валидации'
    } finally {
      ;(ctx.state as any)._mergedText = undefined
    }

    const payload = await renderAddStoryTextScreen(ctx)
    const postfix = err ? `❌ ${err}` : '✅ Сохранено.'
    await updateMenu(ctx, `${payload.text}\n\n${postfix}`, payload.inline)

    await tryDeleteUserMessages(ctx)
  })
}
