import type { Telegraf } from 'telegraf'
import type { MyContext } from '../../shared/types'
import { isAdmin } from '../../shared/utils'
import { getOrCreateDraft } from './draft.service'
import { aggPush } from './input.aggregator'

export function registerDraftInputCollector(bot: Telegraf<MyContext>) {
  bot.on('message', async (ctx, next) => {
    const u = ctx.state.user
    if (!u || !isAdmin(u)) return next()

    const msg: any = ctx.message
    const chunk: string | undefined =
      typeof msg?.text === 'string' ? msg.text :
      (typeof msg?.caption === 'string' ? msg.caption : undefined)

    if (!chunk) return next()

    const d = await getOrCreateDraft(u.tgId)
    if (!d.pendingInput) return next()

    aggPush(ctx, chunk)
  })
}
