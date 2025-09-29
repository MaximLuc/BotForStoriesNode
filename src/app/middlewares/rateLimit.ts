import type { MiddlewareFn } from 'telegraf'
import type { MyContext } from '../../shared/types'

const LIMIT = 3
const WINDOW_MS = 2000
const buckets = new Map<number, number[]>()
let lastSweep = Date.now()
const SWEEP_EVERY_MS = 60_000

export const rateLimit: MiddlewareFn<MyContext> = async (ctx, next) => {
  const now = Date.now()
  const uid = ctx.from?.id
  if (!uid) return next()

  if (now - lastSweep > SWEEP_EVERY_MS) {
    for (const [id, times] of buckets) {
      const fresh = times.filter((t) => now - t <= WINDOW_MS)
      if (fresh.length === 0) buckets.delete(id)
      else buckets.set(id, fresh)
    }
    lastSweep = now
  }

  const times = buckets.get(uid) ?? []
  const fresh = times.filter((t) => now - t <= WINDOW_MS)
  fresh.push(now)
  buckets.set(uid, fresh)

  if (ctx.message && 'text' in ctx.message && ctx.message.text === '/help') {
    return next()
  }

  if (fresh.length > LIMIT) {
    try {
      if ('callback_query' in ctx.update) {
        await ctx.answerCbQuery('Слишком часто')
      } else {
        await ctx.reply('Слишком часто')
      }
    } catch {}
    return
  }

  return next()
}
