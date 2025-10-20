import type { Telegraf } from "telegraf";
import { Types } from "mongoose";
import type { MyContext } from "../shared/types";
import { navigate } from "./ui/navigate";
import { registerAddStoryTextActions } from "../features/stories/addStoryText.actions";
import { registerCoverActions } from "../features/stories/cover.actions";
import { registerReadHandlers } from "../features/reading/read.handlers";
import { registerDraftInputCollector } from "../features/stories/addStoryText.collector";
import { registerDraftFinishHandlers } from "../features/stories/addStoryText.finish";
import { registerFileImportActions } from "../features/stories/fileImport.actions";
import { registerAdminDeleteHandlers } from "../features/stories/adminDelete.handlers";
import { registerAdminCoverHandlers } from "../features/stories/adminCover.handlers";
import { registerBroadcastActions } from "../features/broadcast/broadcast.actions";
import { registerBroadcastSweeper } from "../features/broadcast/broadcast.sweeper";
import { registerSubscriptionAdminActions } from "../features/subscription/subscription.actions";
import { registerSubscriptionUserActions } from "../features/subscription/subscription.user.actions";
import { registerBuyEndingActions } from "../features/reading/buyEnding.actions";
import { isAdmin } from "../shared/utils";
import { addTokens } from "../features/tokens/wallet.service";

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

  bindDual(bot, { text: "Админ", action: "admin" }, async (ctx) =>
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
    { text: "Добавить историю текстом", action: "admin:add_story_text" },
    async (ctx) => navigate(ctx, "addStoryText")
  );

  bot.action(/^read_stories:page:(\d+)$/, async (ctx) =>
    navigate(ctx, "readStories")
  );

  bot.action("support", async (ctx) => {
    await ctx.answerCbQuery();

    const text = `
🛠 *Техническая поддержка*

Бот находится на стадии *тестирования*, возможны ошибки и перебои в работе.

Если что-то не работает или хочешь оставить отзыв —
напиши в поддержку: [@tema_cl](https://t.me/tema_cl)
`;

    await ctx.editMessageText(text.trim(), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "↩︎ Назад в меню", callback_data: "main" }]],
      },
      link_preview_options: { is_disabled: true },
    });
  });

  bot.action("help", async (ctx) => {
  await ctx.answerCbQuery();

  const text = `
ℹ️ *Помощь и информация о боте*

Добро пожаловать в бота *Юля С "Bot"*!  
Здесь ты можешь читать интерактивные истории с разными концовками.  
Некоторые концовки доступны только подписчикам ⭐

📚 *Основные разделы:*
- *ВСЕ ИСТОРИИ* — список доступных историй.
- *Профиль* — показывает твою роль, количество токенов и статистику.
- *Админ* — раздел для управления историями (только для админов).
- *Техподдержка* — если что-то не работает, можно написать в поддержку.

🧠 Совет: за каждое действие бот старается сохранять твой прогресс,  
так что можно вернуться к чтению позже без потери данных.
`;

  await ctx.editMessageText(text.trim(), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📞 Техподдержка", callback_data: "support" }],
        [{ text: "↩︎ Назад в меню", callback_data: "main" }],
      ],
    },
    link_preview_options: { is_disabled: true },
  });
});

  bot.catch((err, ctx) => {
    console.error("Bot error for update", ctx.update.update_id, err);
  });

  bot.command("give_tokens", async (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user))
      return ctx.reply("Только для админа");
    const parts = (ctx.message as any).text.trim().split(/\s+/);
    const amount = Math.max(1, Number(parts[1] ?? 1));
    const userId = (ctx.state.user as any)?._id as Types.ObjectId;
    await addTokens(userId, amount);
    return ctx.reply(`Выдано ${amount} токен(ов).`);
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
