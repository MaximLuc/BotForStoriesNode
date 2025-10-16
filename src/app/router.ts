import type { Telegraf } from "telegraf";
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

  bot.command("whoami", (ctx) => {
    const u = ctx.state.user;
    if (!u) return ctx.reply("пользователь не найден");
    return ctx.reply(
      `id: ${u.tgId}\nusername: ${u.username ?? "-"}\nrole: ${u.role}`
    );
  });

  bot.catch((err, ctx) => {
    console.error("Bot error for update", ctx.update.update_id, err);
  });

  registerReadHandlers(bot);
  registerAddStoryTextActions(bot);
  registerDraftInputCollector(bot);
  registerDraftFinishHandlers(bot);
  registerCoverActions(bot);
  registerFileImportActions(bot);
  registerAdminDeleteHandlers(bot);
  registerAdminCoverHandlers(bot);
  registerBroadcastActions(bot)
  registerBroadcastSweeper(bot)
  registerSubscriptionAdminActions(bot)
  registerSubscriptionUserActions(bot)
}
