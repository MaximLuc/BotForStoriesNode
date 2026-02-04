import type { Telegraf } from "telegraf";import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { Types } from "mongoose";
import { addTokens } from "./wallet.service.js";
import { cfg } from "../../shared/config.js";
import { Payment } from "../../db/models/Payment.js";
import { respond } from "../../app/ui/respond.js";

const PACKS = [
  { id: "p6", tokens: 6, priceRub: 100 },
  { id: "p13", tokens: 13, priceRub: 200 },
  { id: "p21", tokens: 21, priceRub: 333 },
  { id: "p35", tokens: 35, priceRub: 500 },
  { id: "p80", tokens: 80, priceRub: 1100 },
] as const;

type PackId = (typeof PACKS)[number]["id"];

function getPack(id: string) {
  return PACKS.find((p) => p.id === id);
}

function makePayload(packId: PackId) {
  return JSON.stringify({ kind: "tokens", packId });
}

function safeParsePayload(raw: unknown): { kind?: string; packId?: string } {
  if (typeof raw !== "string") return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    const kind = (obj as any).kind;
    const packId = (obj as any).packId;
    return {
      kind: typeof kind === "string" ? kind : undefined,
      packId: typeof packId === "string" ? packId : undefined,
    };
  } catch {
    return {};
  }
}

function getSuccessfulPayment(ctx: MyContext) {
  const msg: any = (ctx as any).message;
  return msg?.successful_payment as
    | {
        currency: string;
        total_amount: number;
        invoice_payload: string;
        telegram_payment_charge_id: string;
        provider_payment_charge_id?: string;
      }
    | undefined;
}

export function registerBuyTokensActions(bot: Telegraf<MyContext>) {
  bot.action(/^buy_tokens:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const packId = String(ctx.match[1] ?? "");
    const pack = getPack(packId);
    if (!pack) return ctx.answerCbQuery("Неизвестный пакет.");

    if (!cfg.payProviderToken) {
      await respond(ctx, "Оплата пока не настроена. Обратитесь в поддержку.", {
        parseMode: "HTML",
        inline: Markup.inlineKeyboard([
          [Markup.button.callback("⬅️ Назад", "buy_tokens")],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ]),
      });
      return;
    }

    const text =
      `🧾 <b>Подтверждение покупки</b>\n\n` +
      `Пакет: <b>${pack.tokens}</b> ключ(ей)\n` +
      `Цена: <b>${pack.priceRub}₽</b>\n\n` +
      `Нажмите «Оплатить», чтобы открыть оплату в Telegram.`;

    await respond(ctx, text, {
      parseMode: "HTML",
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("✅ Оплатить", `buy_tokens:pay:${pack.id}`)],
        [Markup.button.callback("⬅️ Назад", "buy_tokens")],
        [Markup.button.callback("🏠 Главное меню", "main")],
      ]),
    });
  });

  bot.action(/^buy_tokens:pay:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const packId = String(ctx.match[1] ?? "");
    const pack = getPack(packId);
    if (!pack) return ctx.answerCbQuery("Неизвестный пакет.");

    if (!cfg.payProviderToken) {
      return ctx.answerCbQuery("Оплата пока не настроена.");
    }

    const payload = makePayload(pack.id);

    const amount = Math.round(pack.priceRub * 100);

    console.log("[invoice]", {
      packId: pack.id,
      priceRub: pack.priceRub,
      amount,
      currency: "RUB",
      isInt: Number.isInteger(amount),
      providerTokenPrefix: String(cfg.payProviderToken).slice(0, 25) + "...",
    });

    const invoice = {
      title: `${pack.tokens} ключ(ей)`,
      description: "Ключи для открытия дополнительных концовок в историях.",
      currency: "RUB",
      prices: [{ label: `${pack.tokens} ключ(ей)`, amount }],
      payload,
      provider_token: cfg.payProviderToken,

      need_email: true,
      send_email_to_provider: true,

      provider_data: JSON.stringify({
        receipt: {
          tax_system_code: cfg.kassaTaxSystemCode,
          items: [
            {
              description: `${pack.tokens} ключ(ей) для бота`,
              quantity: 1,

              amount: { value: pack.priceRub, currency: "RUB" },

              vat_code: cfg.kassaVatCode,
              payment_mode: "full_payment",
              payment_subject: cfg.kassaPaymentSubject,
            },
          ],
        },
      }),
    };

    try {
      await (ctx.state as any).sendSingleInvoice(invoice);
      await ctx.reply(
        "💡 Если вы передумали, вы можете вернуться назад.",
        Markup.inlineKeyboard([
          [Markup.button.callback("🔙 К покупке ключей", "buy_tokens")],
          [Markup.button.callback("🏠 Главное меню", "main")],
        ]),
      );
    } catch (e: any) {
      await respond(
        ctx,
        "⚠️ Не удалось открыть оплату. Попробуйте ещё раз (создайте новый счёт).",
        {
          parseMode: "HTML",
          inline: Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔄 Попробовать снова",
                `buy_tokens:pay:${pack.id}`,
              ),
            ],
            [Markup.button.callback("⬅️ Назад", "buy_tokens")],
            [Markup.button.callback("🏠 Главное меню", "main")],
          ]),
        },
      );
    }
  });

  bot.on("pre_checkout_query", async (ctx) => {
    const q = ctx.preCheckoutQuery;
    const data = safeParsePayload(q.invoice_payload);
    const pack = data.packId ? getPack(data.packId) : undefined;

    const expected = pack ? Math.round(pack.priceRub * 100) : -1;

    const ok =
      data.kind === "tokens" &&
      !!pack &&
      q.currency === "RUB" &&
      q.total_amount === expected;

    try {
      await ctx.answerPreCheckoutQuery(
        ok,
        ok ? undefined : "Платёж не прошёл проверку. Попробуйте ещё раз.",
      );
    } catch {}
  });

  bot.on("message", async (ctx, next) => {
    const sp = getSuccessfulPayment(ctx);
    if (!sp) return next?.();

    const data = safeParsePayload(sp.invoice_payload);
    if (data.kind !== "tokens" || !data.packId) return next?.();

    const pack = getPack(data.packId);
    if (!pack) return next?.();

    const u = ctx.state.user;
    const userId = (u as any)?._id as Types.ObjectId | undefined;
    if (!userId) return next?.();

    const expectedAmount = Math.round(pack.priceRub * 100);
    if (sp.currency !== "RUB" || sp.total_amount !== expectedAmount) {
      await (ctx.state as any).sendSingle?.(
        "⚠️ Платёж получен, но не прошёл проверку суммы/валюты. Напишите в поддержку.",
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Главное меню", "main")],
        ]),
      );
      return next?.();
    }

    const telegramChargeId = sp.telegram_payment_charge_id;
    if (!telegramChargeId) return next?.();

    const already = await Payment.findOne({ telegramChargeId }).lean();
    if (!already) {
      try {
        await Payment.create({
          userId,
          tgId: ctx.from?.id,
          kind: "tokens",
          packId: pack.id,
          tokens: pack.tokens,
          currency: sp.currency,
          totalAmount: sp.total_amount,
          telegramChargeId,
          providerChargeId: sp.provider_payment_charge_id,
          invoicePayload: sp.invoice_payload,
        });

        await addTokens(userId, pack.tokens);
      } catch (e: any) {
        if (String(e?.code) !== "11000") {
          await (ctx.state as any).sendSingle?.(
            "⚠️ Платёж получен, но произошла ошибка учёта. Напишите в поддержку.",
            Markup.inlineKeyboard([
              [Markup.button.callback("🏠 Главное меню", "main")],
            ]),
          );
          return next?.();
        }
      }
    }

    await (ctx.state as any).sendSingle?.(
      `🥳 Оплата получена!\nНа ваш счёт зачислено ${pack.tokens} ключ(ей).`,
      Markup.inlineKeyboard([
        [Markup.button.callback("💰 Купить ещё ключи", "buy_tokens")],
        [Markup.button.callback("🏠 Главное меню", "main")],
      ]),
    );

    return next?.();
  });
}
