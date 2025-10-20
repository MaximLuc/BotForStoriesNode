
import 'dotenv/config';

import { connectDB } from "./db/connect.js";
import { cfg } from "./shared/config.js";
import { initBot } from "./app/bot.js";

async function main() {
  if (!cfg.botToken) {
    console.error("Добавьте токен бота в файл .env (BOT_TOKEN=...)");
    process.exit(1);
  }
  if (!cfg.mongoUrl) {
    console.error("Добавьте URL для базы данных в файл .env (MONGO_URL=...)");
    process.exit(1);
  }

  
  await connectDB(cfg.mongoUrl);

  const { bot } = initBot(cfg.botToken);
  await bot.launch();
  console.log("Бот запущен (long polling)");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
