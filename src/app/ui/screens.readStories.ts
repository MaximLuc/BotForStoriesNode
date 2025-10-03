import type { MyContext } from '../../shared/types'
import { Markup } from 'telegraf'
import type { ScreenPayload } from './screens'
import { Story } from '../../db/models/Story'
import type { InlineKeyboardButton } from 'telegraf/types'

const PAGE_SIZE = 10

function truncate(text: string, max = 40) {
  const t = (text ?? '').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}
function dotLeaders(left: string, right: string, width = 48) {
  const L = left.trim()
  const R = right.trim()
  const dots = Math.max(1, width - (L.length + R.length))
  return `${L} ${'·'.repeat(dots)} ${R}`
}
function star(minRank?: number) { return (minRank ?? 0) >= 1 ? '★ ' : '' }

function twoColButtons(items: { _id: string, title: string, minRank?: number }[]) {
  const rows: InlineKeyboardButton[][] = []
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i]
    const b = items[i + 1]
    const row: InlineKeyboardButton[] = [
      Markup.button.callback(`${star(a.minRank)}${truncate(a.title, 32)}`, `story:${a._id}`)
    ]
    if (b) row.push(Markup.button.callback(`${star(b.minRank)}${truncate(b.title, 32)}`, `story:${b._id}`))
    rows.push(row)
  }
  return rows
}

export async function renderReadStoriesScreen(ctx: MyContext): Promise<ScreenPayload> {
  let page = 0
  const data = (typeof ctx.callbackQuery === 'object' && 'data' in (ctx.callbackQuery ?? {}))
    ? String((ctx.callbackQuery as any).data) : ''
  if (data.startsWith('read_stories:page:')) {
    const p = Number(data.split(':')[2])
    if (Number.isFinite(p) && p >= 0) page = p
  }

  const query = { isPublished: true }
  const total = await Story.countDocuments(query)
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (page > pages - 1) page = pages - 1

  const docs = await Story.find(query)
    .sort({ createdAt: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean()

  if (!docs.length) {
    return {
      text: 'Пока нет доступных историй.',
      inline: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'main')]]),
    }
  }

  const header = `📚 Доступные истории (★ — премиум)\nСтр. ${page + 1}/${pages} · всего ${total}\n`
  const lines = docs.map(s => {
    const left = `${star(s.minRank)}${truncate(s.title)}`
    const right = `(${Array.isArray(s.endings) ? s.endings.length : 0})`
    return ' ' + dotLeaders(left, right)
  })
  const text = [header, ...lines].join('\n')

  const storyRows = twoColButtons(docs.map(d => ({ _id: String(d._id), title: d.title, minRank: d.minRank })))

  const navRow: InlineKeyboardButton[] = []
  if (page > 0) navRow.push(Markup.button.callback('◀️ Назад', `read_stories:page:${page - 1}`))
  if (page < pages - 1) navRow.push(Markup.button.callback('Вперёд ▶️', `read_stories:page:${page + 1}`))

  const rows: InlineKeyboardButton[][] = [
    ...storyRows,
    ...(navRow.length ? [navRow] : []),
    [Markup.button.callback('⬅️ В меню', 'main')],
  ]

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
  }
}
