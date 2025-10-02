import type { MyContext } from '../../shared/types'
import { Markup } from 'telegraf'
import type { ScreenPayload } from './screens'
import { Story } from '../../db/models/Story'

export async function renderStoriesListScreen(ctx: MyContext): Promise<ScreenPayload> {
  const stories = await Story.find({ isPublished: true })
    .sort({ createdAt: -1 })
    .limit(20)

  if (!stories.length) {
    return {
      text: 'Пока нет доступных историй.',
      inline: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'main')]]),
    }
  }

  const lines = stories.map((s) => {
    const prefix = s.minRank === 1 ? '★ ' : ''
    const title = s.title.padEnd(25, '·')
    return `${prefix}${title} (${s.endings.length})`
  })

  const text = `Истории:\n\n${lines.join('\n')}`

  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (let i = 0; i < stories.length; i += 2) {
    const left = stories[i]
    const right = stories[i + 1]

    const leftBtn = Markup.button.callback(
      `${left.minRank === 1 ? '★ ' : ''}${left.title}`,
      `story:${left._id}`
    )

    if (right) {
      const rightBtn = Markup.button.callback(
        `${right.minRank === 1 ? '★ ' : ''}${right.title}`,
        `story:${right._id}`
      )
      rows.push([leftBtn, rightBtn])
    } else {
      rows.push([leftBtn])
    }
  }

  rows.push([Markup.button.callback('⬅️ Назад', 'main')])

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
  }
}
