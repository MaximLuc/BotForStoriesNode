import {connectDB} from './db/connect'
import{cfg} from './shared/config'
import {initBot} from './app/bot'

async function main() {


    if(!cfg.botToken){
        console.error('Добавьте токен бота в файл .env.local');
        process.exit(1);
    }
    if(!cfg.mongoUrl){
        console.error('Добавьте URL для базы данных в файл .env.local');
        process.exit(1);
    }

    await connectDB(cfg.mongoUrl)

    const {bot} =initBot(cfg.botToken)
    await bot.launch()
    console.log("Бот запущен с polling")

    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})