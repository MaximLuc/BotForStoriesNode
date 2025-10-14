import type { Telegraf, Context } from "telegraf";

export function registerMiddlewares(bot: Telegraf<Context>) {
  bot.use(async (ctx, next) => {
    const from = ctx.from?.id ? `u${ctx.from.id}` : "unknown";
    const type = ctx.updateType;
    console.log(`➡️  ${from} ${type}`);
    return next();
  });
}
