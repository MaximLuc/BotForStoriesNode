import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types";
import { Types } from "mongoose";
import { spendOneToken } from "../tokens/wallet.service";
import { grantExtraByToken } from "./endingChoice.service";
import { Story } from "../../db/models/Story";
import { renderReadEndingScreen } from "../../app/ui/screens.readStory";
import { Markup } from "telegraf";
import { renderBuyEndingConfirmScreen } from "../../app/ui/screens.buyEnding";
import { chooseEnding } from "./reading.service";

function esc(s: string = ""): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function editOrReply(ctx: MyContext, text: string, inline?: any) {
  try {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: inline?.reply_markup ?? inline,
    });
  } catch {
    const sent = await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: inline?.reply_markup ?? inline,
    });
    (ctx.state as any)?.rememberMessageId?.(sent.message_id);
  }
}

export function registerBuyEndingActions(bot: Telegraf<MyContext>) {
  bot.action(/^ending:buy:confirm:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    const storyId = String(ctx.match[1]);
    const idx = Number(ctx.match[2]);
    const u = ctx.state.user as any;
    const userId = u?._id as Types.ObjectId | undefined;
    if (!userId) return;

    const story = await Story.findById(storyId);
    const ending = story?.endings?.[idx];
    if (!story || !ending) {
      return editOrReply(
        ctx,
        "История недоступна.",
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ К списку", "read_stories")],
        ])
      );
    }

    const ok = await spendOneToken(userId);
    if (!ok) {
      return editOrReply(
        ctx,
        "Недостаточно токенов. Перейдите в меню пополнения.",
        Markup.inlineKeyboard([
          [Markup.button.callback("🪙 Купить токены", "tokens:menu")],
          [Markup.button.callback("↩︎ Назад", `story:${storyId}`)],
        ])
      );
    }

    await grantExtraByToken(userId, story._id, ending._id);

    await chooseEnding(ctx, storyId, idx);

    const { text, inline } = await renderReadEndingScreen(ctx, {
      storyId,
      endingIndex: idx,
      page: 0,
    });
    return editOrReply(ctx, esc(text), inline);
  });

  bot.action("tokens:menu", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return editOrReply(
      ctx,
      "🪙 Покупка токенов скоро будет доступна.\n\nПока можете обратиться в поддержку.",
      Markup.inlineKeyboard([[Markup.button.callback("↩︎ Назад", "main")]])
    );
  });
}
