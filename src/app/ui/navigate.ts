import type { MyContext } from '../../shared/types.js'
import { respond } from './respond.js'
import { getScreen, type ScreenId } from './screens.js'

export async function navigate(ctx: MyContext, id: ScreenId) {
  const payload = await getScreen(ctx, id)
  return respond(ctx, payload.text, {
    inline: payload.inline,
    setReplyKeyboard: payload.setReplyKeyboard,
    replyNoticeText: payload.replyNoticeText,
    parseMode: payload.parseMode ?? 'Markdown',
  })
}