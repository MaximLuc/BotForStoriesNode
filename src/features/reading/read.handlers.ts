import type { Telegraf } from 'telegraf'
import type { MyContext } from '../../shared/types'
import { Markup } from 'telegraf'
import { Story } from '../../db/models/Story'
import { renderReadStoryScreen } from '../../app/ui/screens.readStory'

type EndingLean = {
  _id: any
  title?: string
  text?: string
  minRank?: number
}
type StoryLean = {
  _id: any
  title: string
  text: string
  endings: EndingLean[]
  isPublished: boolean
  minRank?: number
}

const PAGE_LEN = 3600

function paginate(text: string, limit = PAGE_LEN): string[] {
  const t = (text ?? '').trim()
  if (t.length <= limit) return [t]
  const parts: string[] = []
  let i = 0
  while (i < t.length) {
    let end = Math.min(i + limit, t.length)
    if (end < t.length) {
      const slice = t.slice(i, end)
      let cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'))
      if (cut < Math.floor(limit * 0.7)) cut = slice.lastIndexOf(' ')
      end = (cut > 0 ? i + cut : end)
    }
    parts.push(t.slice(i, end).trim())
    i = end
  }
  return parts.filter(Boolean)
}

function userRank(ctx: MyContext): 0 | 1 {
  const role = (ctx.state.user as any)?.role
  const privileged = ['premium', 'admin', 'premium_admin']
  return privileged.includes(role) ? 1 : 0
}

async function editOrReply(ctx: MyContext, text: string, inline?: any) {
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: inline?.reply_markup ?? inline })
  } catch {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: inline?.reply_markup ?? inline })
  }
}

export function registerReadHandlers(bot: Telegraf<MyContext>) {
  bot.action(/^story:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const { text, inline } = await renderReadStoryScreen(ctx)
    await editOrReply(ctx, text, inline)
  })

  bot.action(/^read:story:([^:]+):p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const { text, inline } = await renderReadStoryScreen(ctx)
    await editOrReply(ctx, text, inline)
  })

  bot.action(/^read:choose:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const storyId = String(ctx.match[1])
    const idx = Number(ctx.match[2])

    const s = await Story.findById(storyId).lean<StoryLean>()
    if (!s || !s.isPublished) {
      return editOrReply(
        ctx,
        'История недоступна.',
        Markup.inlineKeyboard([[Markup.button.callback('↩︎ К списку', 'read_stories')]])
      )
    }

    const endings = Array.isArray(s.endings) ? s.endings : []
    const ending = endings[idx]
    if (!ending) {
      return editOrReply(
        ctx,
        'Окончание не найдено.',
        Markup.inlineKeyboard([[Markup.button.callback('↩︎ К истории', `story:${storyId}`)]])
      )
    }

    const needRank = (ending.minRank ?? 0)
    const ur = userRank(ctx)

    if (needRank > ur) {
      const lastPage = Math.max(0, paginate(s.text || '').length - 1)
      return editOrReply(
        ctx,
        `★ Это окончание доступно только подписчикам.\n\n*${s.title}* → _${ending.title ?? 'Окончание'}_`,
        Markup.inlineKeyboard([
          [Markup.button.callback('⭐ Оформить подписку', 'subscribe')],
          [Markup.button.callback('↩︎ Назад к истории', `read:story:${storyId}:p:${lastPage}`)],
        ])
      )
    }

    const lastPage = Math.max(0, paginate(s.text || '').length - 1)
    return editOrReply(
      ctx,
      `*${s.title}*\n\n_${ending.title ?? 'Окончание'}_\n\n${ending.text ?? ''}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('↩︎ К истории', `read:story:${storyId}:p:${lastPage}`)],
        [Markup.button.callback('📚 К списку', 'read_stories')],
      ])
    )
  })

  // заглушка подписки
  bot.action('subscribe', async (ctx) => {
    await ctx.answerCbQuery()
    await editOrReply(
      ctx,
      '⭐ Подписка скоро будет доступна.\n\nОформите премиум, чтобы читать все концовки.',
      Markup.inlineKeyboard([[Markup.button.callback('↩︎ К списку', 'read_stories')]])
    )
  })

  bot.action('noop', async (ctx) => ctx.answerCbQuery())
}
