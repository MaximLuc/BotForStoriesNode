import type { MyContext } from '../../shared/types'
import { buildInlineMain } from './menus'
import { Markup } from 'telegraf'
import { isAdmin } from '../../shared/utils'
import { renderAddStoryTextScreen } from './screens.addStoryText'
import { renderReadStoriesScreen } from './screens.readStories'

export type ScreenId =
  | 'main'
  | 'profile'
  | 'admin'
  | 'storiesList'
  | 'statistics'
  | 'setCover'
  | 'addStoryText'
  | 'readStories'


export type ScreenPayload = {
  text: string
  inline?: ReturnType<typeof Markup.inlineKeyboard>
  setReplyKeyboard?: boolean
  replyNoticeText?: string
}

type ScreenRenderer = (ctx: MyContext) => Promise<ScreenPayload> | ScreenPayload

const screens: Record<ScreenId, ScreenRenderer> = {
  main: (ctx) => ({
    text: `Привет, ${ctx.from?.first_name || 'друг'}!`,
    inline: buildInlineMain(ctx.state.user),
    setReplyKeyboard: true,
    replyNoticeText: '',
  }),

  profile: () => ({
    text: 'Твой профиль (демо)',
    inline: Markup.inlineKeyboard([
        [Markup.button.callback('Назад', 'main')],
    ]),
  }),

  admin: (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) {
      return {
        text: 'Доступ только для админа.',
        inline: buildInlineMain(undefined),
      }
    }
    return {
      text: 'Админ-панель (демо)',
      inline: Markup.inlineKeyboard([
        [Markup.button.callback('Истории', 'admin:stories')],
        [Markup.button.callback('Статистика', 'admin:statistics')],
        [Markup.button.callback('Обложки', 'admin:cover')],
        [Markup.button.callback('История текстом', 'admin:add_story_text')],
        [Markup.button.callback('Назад', 'main')],
      ]),
    }
  },

  storiesList: () => ({
    text: 'Список историй (заглушка)',
    inline: Markup.inlineKeyboard([[Markup.button.callback('Назад', 'admin')]]),
  }),

  statistics:()=>({
    text: 'Статистика (заглушка)',
    inline: Markup.inlineKeyboard([[Markup.button.callback('Назад', 'admin')]]),
  }),

  setCover:()=>({
    text: 'Установить обложку (заглушка)',
    inline: Markup.inlineKeyboard([[Markup.button.callback('Назад', 'admin')]]),
  }),

  addStoryText: (ctx) => renderAddStoryTextScreen(ctx),
  
  readStories: (ctx) => renderReadStoriesScreen(ctx),
}

export function getScreen(ctx: MyContext, id: ScreenId): ScreenPayload {
  const r = screens[id]
  if (!r) return { text: 'Экран не найден', inline: buildInlineMain(undefined) }
  return r(ctx) as ScreenPayload
}
