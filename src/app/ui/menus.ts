import { Markup } from "telegraf";
import type { UserDoc } from "../../db/models/User.js";
import { isAdmin, isPremium } from "../../shared/utils.js";

export function hasAdminAccess(user?: UserDoc) {
  return isAdmin(user);
}

export function hasPremiumAccess(user?: UserDoc) {
  return isPremium(user);
}

export function buildReplyMain(user?: UserDoc) {
  const rows: string[][] = [["Профиль", "Читать истории"], ["Помощь"]];
  if (hasAdminAccess(user)) rows.push(["Админка"]);
  return Markup.keyboard(rows);
}

export function buildInlineMain(user?: UserDoc) {
  const rows = [
    [Markup.button.callback("✨ МОЙ ПРОФИЛЬ ✨", "profile")],

    [Markup.button.callback("📖 ЧИТАТЬ ИСТОРИИ", "read_stories")],

    [Markup.button.callback("🎧 СЛУШАТЬ ИСТОРИИ", "listen_stories")],

    [Markup.button.callback("💰 Купить ключи", "buy_tokens")],
    [Markup.button.callback("Помощь", "help")],
    [Markup.button.callback("Техподдержка", "support")],
  ] as any[];

  if (hasAdminAccess(user))
    rows.push([Markup.button.callback("Админка", "admin")]);

  return Markup.inlineKeyboard(rows);
}



