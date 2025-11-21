import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Types } from "mongoose";
import { addTokens } from "./wallet.service.js";
import { cfg } from "../../shared/config.js";

const PACKS = [
  { id: "p2",  tokens: 2,  priceRub: 35 },
  { id: "p5",  tokens: 5,  priceRub: 80 },
  { id: "p10", tokens: 10, priceRub: 150 },
  { id: "p20", tokens: 20, priceRub: 280 },
  { id: "p35", tokens: 35, priceRub: 430 },
  { id: "p50", tokens: 50, priceRub: 600 },
] as const;

function getPack(id: string) {
  return PACKS.find((p) => p.id === id);
}

export function registerBuyTokensActions(bot: Telegraf<MyContext>) {
  bot.action(/^buy_tokens:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const packId = ctx.match[1];
    const pack = getPack(packId);
    if (!pack) {
      return ctx.answerCbQuery("Неизвестный пакет.");
    }

    if (!cfg.payProviderToken) {
      return ctx.reply("Оплата пока не настроена. Обратитесь в поддержку.");
    }

    const payload = JSON.stringify({
      kind: "tokens",
      packId: pack.id,
      tokens: pack.tokens,
    });

    await ctx.replyWithInvoice({
      title: `${pack.tokens} токен(ов)`,
      description: "Токены для открытия дополнительных концовок в историях.",
      currency: "RUB",
      prices: [
        {
          label: `${pack.tokens} токен(ов)`,
          amount: pack.priceRub * 100, 
        },
      ],
      payload,
      provider_token: cfg.payProviderToken,
    } as any); 
  });

  bot.on("pre_checkout_query", async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch {
    }
  });

  bot.on("message", async (ctx, next) => {
    const msg: any = ctx.message;
    const sp = msg?.successful_payment;
    if (!sp) return next?.();

    let data: any;
    try {
      data = JSON.parse(sp.invoice_payload as string);
    } catch {
      return next?.();
    }

    if (data?.kind !== "tokens") return next?.();

    const u = ctx.state.user;
    const userId = (u as any)?._id as Types.ObjectId | undefined;
    if (!userId) return next?.();

    const tokensToAdd = Number(data.tokens) || 0;
    if (tokensToAdd <= 0) return next?.();

    await addTokens(userId, tokensToAdd);

    await ctx.reply(
      `🥳 Оплата получена!\nНа ваш счёт зачислено ${tokensToAdd} токен(ов).`
    );

    return next?.();
  });
}
