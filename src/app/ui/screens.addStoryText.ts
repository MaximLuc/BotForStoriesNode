import type { MyContext } from '../../shared/types'
import { Markup } from 'telegraf'
import { getOrCreateDraft, canCreate } from '../../features/stories/draft.service'
import type { DraftStoryDoc, DraftEnding } from '../../db/models/DraftStory'
import type { InlineKeyboardButton } from 'telegraf/types'

function previewIntro(intro?: string | null) {
  if (!intro) return '—'
  const s = intro.trim().split(/\s+/).slice(0, 8).join(' ')
  return s + (intro.trim().length > s.length ? '…' : '')
}

const cb = (text: string, data: string): InlineKeyboardButton => ({ text, callback_data: data })

export async function renderAddStoryTextScreen(ctx: MyContext) {
  const tgId = ctx.state.user?.tgId
  if (!tgId) {
    return {
      text: 'Пользователь не найден',
      inline: Markup.inlineKeyboard([[cb('⬅️ Назад', 'admin')]]),
    }
  }

  const d: DraftStoryDoc = await getOrCreateDraft(tgId)

  const rows: InlineKeyboardButton[][] = []

  rows.push([cb('📝 Задать название', 'draft:set_title')])
  rows.push([cb('✍️ Задать начало истории', 'draft:set_intro')])
  rows.push([cb('➕ Добавить продолжение', 'draft:add_ending')])

  ;(d.endings as DraftEnding[]).forEach((_: DraftEnding, i: number) => {
    rows.push([cb(`✏️ Название продолжения #${i + 1}`, `draft:set_end_title:${i}`),
               cb(`🧾 Текст #${i + 1}`, `draft:set_end_text:${i}`)])
    rows.push([cb(`🗑 Удалить продолжение #${i + 1}`, `draft:del_end:${i}`)])
  })

  const ready = canCreate({
    title: d.title ?? undefined,
    intro: d.intro ?? undefined,
    endings: d.endings as DraftEnding[],
  })
  const finalRow: InlineKeyboardButton[] = []
  if (ready) finalRow.push(cb('✅ Загрузить историю', 'draft:commit'))
  finalRow.push(cb('⬅️ Назад', 'admin'))
  rows.push(finalRow)

  const endingsPreview: string =
    d.endings.length
      ? (d.endings as DraftEnding[])
          .map((e: DraftEnding, i: number) =>
            `#${i + 1} ${e.title ? `«${e.title}»` : '—'} / ${e.text ? '✅' : '—'}`
          )
          .join('; ')
      : '—'

  const text =
`Создание истории (форма)

Название: ${d.title ?? '—'}
Начало: ${previewIntro(d.intro ?? undefined)}
Окончания: ${endingsPreview}
Доступ: ${d.minRank === 1 ? 'только премиум' : 'для всех'}
`

  return {
    text,
    inline: Markup.inlineKeyboard(rows),
  }
}
