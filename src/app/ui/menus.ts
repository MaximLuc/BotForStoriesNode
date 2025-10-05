import { Markup } from 'telegraf'
import type { UserDoc } from '../../db/models/User'
import { isAdmin, isPremium } from '../../shared/utils'


export function hasAdminAccess(user?: UserDoc) {
  return isAdmin(user)
}

export function hasPremiumAccess(user?: UserDoc) {
  return isPremium(user)
}

export function buildReplyMain(user?: UserDoc) {
  const rows: string[][] = [
    ['Меню', 'Профиль','📖ВСЕ ИСТОРИИ📖'],
  ]
  if (hasAdminAccess(user)) rows.push(['Админ'])
  
  return Markup.keyboard(rows) 
}

export function buildInlineMain(user?: UserDoc) {
  const rows = [
    [Markup.button.callback('✨МОЙ ПРОФИЛЬ✨', 'profile')],
    [Markup.button.callback('📖ВСЕ ИСТОРИИ📖', 'read_stories')],
    [Markup.button.callback('Помощь', 'help')],
    [Markup.button.callback('Техподдержка', 'support')],
  ] as any[]
  if (hasAdminAccess(user)) rows.push([Markup.button.callback('Админ', 'admin')])
  return Markup.inlineKeyboard(rows)
}
