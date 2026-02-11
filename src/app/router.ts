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
import { registerBuyTokensActions } from "../features/tokens/buyTokens.actions.js";

import { registerAudioHandlers } from "../features/audio/audio.handlers.js";
import { registerAudioAdmin } from "../features/audio/audio.admin.js";

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

  bot.action(/^welcome:p:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const p = Number(ctx.match[1]);
    (ctx.state as any).welcomePage = Number.isFinite(p) ? p : 0;
    return navigate(ctx, "main");
  });

  bindDual(bot, { text: "Меню", action: "main" }, async (ctx) =>
    navigate(ctx, "main")
  );

  bindDual(bot, { text: "Профиль", action: "profile" }, async (ctx) =>
    navigate(ctx, "profile")
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

  bindDual(
    bot,
    { text: "Слушать истории", action: "listen_stories" },
    async (ctx) => navigate(ctx, "listenStories")
  );

  bot.action("admin:stats", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "adminStats");
  });

  bot.action("admin:stories", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "adminStories");
  });

  bot.action("admin:marketing", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "adminMarketing");
  });

  bot.action("admin:interactive", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "adminInteractive");
  });

  bot.action("admin:settings", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "adminInteractive");
  });

  bot.action("admin:content", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "adminStories");
  });


  bot.action("admin:statistics_audio", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "statistics_audio");
  });

  bot.action("admin:stories_brief", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "adminStoriesBrief");
  });

  bindDual(
    bot,
    { text: "Добавить историю (текстом)", action: "admin:add_story_text" },
    async (ctx) => navigate(ctx, "addStoryText")
  );

  bindDual(bot, { text: "Купить ключи", action: "buy_tokens" }, async (ctx) =>
    navigate(ctx, "buyTokens")
  );

  bot.action(/^read_stories:page:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "readStories");
  });

  bot.action(/^listen_stories:page:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return navigate(ctx, "listenStories");
  });

  bot.action("support", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

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

  bindDual(bot, { text: "Помощь", action: "help" }, async (ctx) =>
    navigate(ctx, "help")
  );

  bot.action(/^help:(general|stories|audio|keys|buttons|other)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const id = String(ctx.match[1]) as any;

    const { renderHelpSectionScreen } = await import("./ui/screens.help.js");
    const payload = await renderHelpSectionScreen(ctx, id);

    return respond(ctx, payload.text, {
      parseMode: payload.parseMode ?? "HTML",
      inline: payload.inline as any,
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
    return ctx.reply(`Начислено ${amount} ключ(ей).`);
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

  registerBuyTokensActions(bot);
  registerBuyEndingActions(bot);

  registerAudioHandlers(bot);
  registerAudioAdmin(bot);
}
