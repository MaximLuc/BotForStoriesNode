import { Telegraf } from 'telegraf'
import { registerMiddlewares } from './middlewares/logger'
import { registerRouter } from './router'
import { rateLimit } from './middlewares/rateLimit'
import {auth} from './middlewares/auth'
import { singleMessage } from './middlewares/singleMessage'

export function initBot(token:string){
    const bot = new Telegraf(token);
    registerMiddlewares(bot)
    bot.use(rateLimit)
    bot.use(auth)
    bot.use(singleMessage)
    registerRouter(bot)

    return {bot}
}