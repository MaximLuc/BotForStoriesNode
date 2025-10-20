import { Markup } from "telegraf"
import type { MyContext } from "../../shared/types.js"
import { Types } from "mongoose"
import { getBalance } from "../../features/tokens/wallet.service.js"

export async function renderBuyEndingConfirmScreen(
  ctx: MyContext,
  storyId: string,
  endingIndex: number,
  userId: Types.ObjectId
) {
  const bal = await getBalance(userId)
  const text = `🪙 <b>Открыть концовку за 1 токен?</b>\n\nБаланс: <b>${bal}</b> токен(ов).\n`

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Открыть за 1 токен", `ending:buy:confirm:${storyId}:${endingIndex}`)],
    [Markup.button.callback("🪙 Купить токены", "tokens:menu")],
    [Markup.button.callback("↩︎ Отмена", `story:${storyId}`)],
  ])

  return { text, inline: kb }
}
