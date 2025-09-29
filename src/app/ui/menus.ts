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
    ['Меню', 'Профиль'],
  ]
  if (hasAdminAccess(user)) rows.push(['Админ'])
  
  return Markup.keyboard(rows) 
}

export function buildInlineMain(user?: UserDoc) {
  const rows = [
    [Markup.button.callback('Меню', 'menu')],
    [Markup.button.callback('Профиль', 'profile')],
  ] as any[]
  if (hasAdminAccess(user)) rows.push([Markup.button.callback('Админ', 'admin')])
  return Markup.inlineKeyboard(rows)
}
