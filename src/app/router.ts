import type { Telegraf } from 'telegraf'
import type { MyContext } from '../shared/types'
import { navigate } from './ui/navigate'
import { registerAddStoryTextActions, registerDraftTextCatcher } from '../features/stories/addStoryText.actions';
import { registerCoverActions } from '../features/stories/cover.actions';
import { registerReadHandlers } from '../features/reading/read.handlers';

function bindDual(
  bot: Telegraf<MyContext>,
  opts: { text: string; action: string },
  handler: (ctx: MyContext) => Promise<any> | any
) {
  bot.hears(opts.text, handler)
  bot.action(opts.action, handler)
}

export function registerRouter(bot: Telegraf<MyContext>) {

  bot.start(async (ctx) => navigate(ctx, 'main'))

  bindDual(bot, { text: 'Меню', action: 'main' }, async (ctx) => navigate(ctx, 'main'))

  bindDual(bot, { text: 'Профиль', action: 'profile' }, async (ctx) => navigate(ctx, 'profile'))

  bindDual(bot, { text: 'Админ', action: 'admin' }, async (ctx) => navigate(ctx, 'admin'))

  bindDual(bot, { text: 'Читать истории', action: 'read_stories' }, async (ctx) => navigate(ctx, 'readStories'))

  bot.action('admin:stories', async (ctx) => navigate(ctx, 'storiesList'))

  bot.action('admin:statistics', async (ctx) => navigate(ctx, 'statistics'))

  bot.action('admin:cover', async (ctx) => navigate(ctx, 'setCover'))

  bindDual(bot, { text: 'Добавить историю текстом', action: 'admin:add_story_text' }, async (ctx) => navigate(ctx, 'addStoryText'))

  bot.action(/^read_stories:page:(\d+)$/, async (ctx) => navigate(ctx, 'readStories'))

  bot.command('whoami', (ctx) => {
    const u = ctx.state.user
    if (!u) return ctx.reply('пользователь не найден')
    return ctx.reply(`id: ${u.tgId}\nusername: ${u.username ?? '-'}\nrole: ${u.role}`)
  })

  bot.help(async (ctx) => ctx.reply('Привет этот бот умеет рассказывать истории'))

  bot.catch((err, ctx) => {
    console.error('Bot error for update', ctx.update.update_id, err)
  })

  registerReadHandlers(bot) 

  registerAddStoryTextActions(bot)
  registerDraftTextCatcher(bot)
  registerCoverActions(bot)

}
