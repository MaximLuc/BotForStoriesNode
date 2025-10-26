import type { Telegraf } from "telegraf";
import { Types } from "mongoose";
import type { MyContext } from "../shared/types.js";
import { navigate } from "./ui/navigate.js";
import { respond } from "./ui/respond.js";
import { registerAddStoryTextActions } from "../features/stories/addStoryText.actions.js";
import { registerCoverActions } from "../features/stories/cover.actions.js";
import { registerReadHandlers } from "../features/reading/read.handlers.js";
import { registerDraftInputCollector } from "../features/stories/addStoryText.collector.js";
import { registerDraftFinishHandlers } from "../features/stories/addStoryText.finish.js";
import { registerFileImportActions } from "../features/stories/fileImport.actions.js";
import { registerAdminDeleteHandlers } from "../features/stories/adminDelete.handlers.js";
import { registerAdminCoverHandlers } from "../features/stories/adminCover.handlers.js";
import { registerBroadcastActions } from "../features/broadcast/broadcast.actions.js";
import { registerBroadcastSweeper } from "../features/broadcast/broadcast.sweeper.js";
import { registerSubscriptionAdminActions } from "../features/subscription/subscription.actions.js";
import { registerSubscriptionUserActions } from "../features/subscription/subscription.user.actions.js";
import { registerBuyEndingActions } from "../features/reading/buyEnding.actions.js";
import { isAdmin } from "../shared/utils.js";
import { addTokens } from "../features/tokens/wallet.service.js";

function bindDual(
  bot: Telegraf<MyContext>,
  opts: { text: string; action: string },
  handler: (ctx: MyContext) => Promise<any> | any
) {
  bot.hears(opts.text, handler);
  bot.action(opts.action, handler);
}

export function registerRouter(bot: Telegraf<MyContext>) {
  bot.start(async (ctx) => navigate(ctx, "main"));

  bindDual(bot, { text: "Меню", action: "main" }, async (ctx) =>
    navigate(ctx, "main")
  );

  bindDual(bot, { text: "Профиль", action: "profile" }, async (ctx) =>
    navigate(ctx, "profile")
  );

  bot.action("profile:subscription", async (ctx) =>
    navigate(ctx, "profileSubscription")
  );
  bot.action("profile:statistics", async (ctx) =>
    navigate(ctx, "profileUserStats")
  );

  bindDual(bot, { text: "Админка", action: "admin" }, async (ctx) =>
    navigate(ctx, "admin")
  );

  bindDual(
    bot,
    { text: "Читать истории", action: "read_stories" },
    async (ctx) => navigate(ctx, "readStories")
  );

  bot.action("admin:stories", async (ctx) => navigate(ctx, "storiesList"));
  bot.action("admin:statistics", async (ctx) => navigate(ctx, "statistics"));

  bindDual(
    bot,
    { text: "Добавить историю (текстом)", action: "admin:add_story_text" },
    async (ctx) => navigate(ctx, "addStoryText")
  );

  bot.action(/^read_stories:page:(\d+)$/, async (ctx) =>
    navigate(ctx, "readStories")
  );

  bot.action("support", async (ctx) => {
    await ctx.answerCbQuery();

    const text = `
📨 Техподдержка

Если что-то не работает, нашли баг или вопрос по функционалу — напишите автору.

Связаться в Telegram: [@tema_cl](https://t.me/tema_cl)
`;

    await respond(ctx, text.trim(), {
      parseMode: "Markdown",
      inline: {
        inline_keyboard: [[{ text: "↩︎ В меню", callback_data: "main" }]],
      },
      linkPreviewOptions: { is_disabled: true },
    });
  });

  bot.action("help", async (ctx) => {
    await ctx.answerCbQuery();

    const text = `
ℹ️ Помощь и навигация

Здесь собраны основные разделы бота и подсказки по навигации.

Как пользоваться:
- Профиль — статус подписки, статистика.
- Читать истории — список доступных историй.
- Помощь — эти подсказки.
- Техподдержка — связаться с автором.
`;

    await respond(ctx, text.trim(), {
      parseMode: "Markdown",
      inline: {
        reply_markup: {
          inline_keyboard: [
            [{ text: "К техподдержке", callback_data: "support" }],
            [{ text: "↩︎ В меню", callback_data: "main" }],
          ],
        },
      } as any,
      linkPreviewOptions: { is_disabled: true },
    });
  });

  bot.catch((err, ctx) => {
    console.error("Bot error for update", ctx.update.update_id, err);
  });

  bot.command("give_tokens", async (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user))
      return ctx.reply("Недостаточно прав");
    const parts = (ctx.message as any).text.trim().split(/\s+/);
    const amount = Math.max(1, Number(parts[1] ?? 1));
    const userId = (ctx.state.user as any)?._id as Types.ObjectId;
    await addTokens(userId, amount);
    return ctx.reply(`Начислено ${amount} токен(ов).`);
  });

  registerReadHandlers(bot);
  registerAddStoryTextActions(bot);
  registerDraftInputCollector(bot);
  registerDraftFinishHandlers(bot);
  registerCoverActions(bot);
  registerFileImportActions(bot);
  registerAdminDeleteHandlers(bot);
  registerAdminCoverHandlers(bot);
  registerBroadcastActions(bot);
  registerBroadcastSweeper(bot);
  registerSubscriptionAdminActions(bot);
  registerSubscriptionUserActions(bot);
  registerBuyEndingActions(bot);
}

