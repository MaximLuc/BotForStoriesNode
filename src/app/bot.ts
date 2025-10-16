import { Telegraf } from "telegraf";
import { registerMiddlewares } from "./middlewares/logger";
import { registerRouter } from "./router";
import { rateLimit } from "./middlewares/rateLimit";
import { auth } from "./middlewares/auth";
import { singleMessage } from "./middlewares/singleMessage";
import { coverPendingGuard } from "./middlewares/coverPendingGuard";
import { longTextMerge } from "./middlewares/longTextMerge";
import { checkSubscription } from "./middlewares/checkSubscription";

export function initBot(token: string) {
  const bot = new Telegraf(token);
  registerMiddlewares(bot);
  bot.use(rateLimit);
  bot.use(auth);
  bot.use(singleMessage);
  bot.use(coverPendingGuard);
  bot.use(longTextMerge);
  bot.use(checkSubscription)
  registerRouter(bot);

  return { bot };
}
