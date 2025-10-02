import type { MiddlewareFn } from 'telegraf'
import type { MyContext } from '../../shared/types'
import { clearPendingCover, sweepPendingCovers } from '../../features/stories/cover.state'

export const coverPendingGuard: MiddlewareFn<MyContext> = async (ctx, next) => {
  sweepPendingCovers()

  if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    const data = String(ctx.callbackQuery.data)
    if (!data.startsWith('cover:') && ctx.state.user?.tgId) {
      clearPendingCover(ctx.state.user.tgId)
    }
  }

  return next()
}
