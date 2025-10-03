import type { MyContext } from '../../shared/types'
import { Markup } from 'telegraf'
import type { ScreenPayload } from './screens'
import { Story } from '../../db/models/Story'
import type { InlineKeyboardButton } from 'telegraf/types'

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

function userRank(ctx: MyContext): 0 | 1 {
  const role = (ctx.state.user as any)?.role
  const privileged = ['premium', 'admin', 'premium_admin']
  return privileged.includes(role) ? 1 : 0
}

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

function makePagerRow(storyId: string, page: number, pages: number): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []
  if (page > 0) row.push(Markup.button.callback('◀️ Назад', `read:story:${storyId}:p:${page - 1}`))
  row.push(Markup.button.callback(`Стр. ${page + 1} из ${pages}`, 'noop'))
  if (page < pages - 1) row.push(Markup.button.callback('Вперёд ▶️', `read:story:${storyId}:p:${page + 1}`))
  return row
}

function star(minRank?: number) {
  return (minRank ?? 0) >= 1 ? '★ ' : ''
}

export async function renderReadStoryScreen(ctx: MyContext): Promise<ScreenPayload> {
  const raw = (typeof ctx.callbackQuery === 'object' && 'data' in (ctx.callbackQuery ?? {}))
    ? String((ctx.callbackQuery as any).data) : ''

  let storyId = ''
  let page = 0

  const mPage = raw.match(/^read:story:([^:]+):p:(\d+)$/)
  const mOpen = raw.match(/^story:([^:]+)$/)

  if (mPage) {
    storyId = mPage[1]
    page = Math.max(0, Number(mPage[2]) || 0)
  } else if (mOpen) {
    storyId = mOpen[1]
  } else {
    storyId = (ctx as any).state?.storyId ?? ''
  }

  const s = await Story.findById(storyId).lean<StoryLean>()
  if (!s || !s.isPublished) {
    return {
      text: 'История не найдена или недоступна.',
      inline: Markup.inlineKeyboard([[Markup.button.callback('↩︎ К списку', 'read_stories')]]),
    }
  }

  const ur = userRank(ctx)
  if ((s.minRank ?? 0) > ur) {
    return {
      text: `★ Эта история доступна только подписчикам.\n\n*${s.title}*`,
      inline: Markup.inlineKeyboard([[Markup.button.callback('↩︎ К списку', 'read_stories')]]),
    }
  }

  const parts = paginate(s.text || '')
  const pages = Math.max(1, parts.length)
  if (page > pages - 1) page = pages - 1

  const titleLine = `*${s.title}*${(s.minRank ?? 0) >= 1 ? '  ★' : ''}`
  const header = pages > 1 ? `_(страница ${page + 1}/${pages})_\n\n` : ''
  const body = parts[page] || ''
  const text = `${titleLine}\n\n${header}${body}`

  const rows: InlineKeyboardButton[][] = []
  if (pages > 1) rows.push(makePagerRow(String(s._id), page, pages))

  if (page === pages - 1) {
    const ends = Array.isArray(s.endings) ? s.endings : []
    if (ends.length) {
      for (let i = 0; i < ends.length; i += 2) {
        const A = ends[i]
        const B = ends[i + 1]
        const row: InlineKeyboardButton[] = [
          Markup.button.callback(`${star(A?.minRank)}${A?.title ?? `Вариант ${i + 1}`}`, `read:choose:${s._id}:${i}`)
        ]
        if (B) {
          row.push(Markup.button.callback(`${star(B?.minRank)}${B?.title ?? `Вариант ${i + 2}`}`, `read:choose:${s._id}:${i + 1}`))
        }
        rows.push(row)
      }
    } else {
      rows.push([Markup.button.callback('Варианты отсутствуют', 'noop')])
    }
  }

  rows.push([Markup.button.callback('↩︎ К списку', 'read_stories')])

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
  }
}
