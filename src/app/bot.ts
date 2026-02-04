import { Telegraf } from "telegraf";
import { telemetry } from "./middlewares/telemetry.js";
import { registerRouter } from "./router.js";
import { rateLimit } from "./middlewares/rateLimit.js";
import { auth } from "./middlewares/auth.js";
import { singleMessage } from "./middlewares/singleMessage.js";
import { coverPendingGuard } from "./middlewares/coverPendingGuard.js";
import { longTextMerge } from "./middlewares/longTextMerge.js";
import { checkSubscription } from "./middlewares/checkSubscription.js";
import { staleGuard } from "./middlewares/staleGuard.js";
import { dailyButtonsMiddleware } from "../shared/dailyButtons.middleware.js";

export function initBot(token: string) {
  const bot = new Telegraf(token);
  bot.use(telemetry);
  bot.use(rateLimit);
  bot.use(auth);
  bot.use(staleGuard);
  bot.use(singleMessage);
  bot.use(coverPendingGuard);
  bot.use(longTextMerge);
  bot.use(checkSubscription)
  bot.use(dailyButtonsMiddleware);
  registerRouter(bot);

  return { bot };
}
