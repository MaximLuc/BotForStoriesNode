import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { isAdmin } from "../../shared/utils.js";
import { AudioDraftStory } from "../../db/models/AudioDraftStory.js";
import { AudioStory } from "../../db/models/AudioStory.js";
import { respond } from "../../app/ui/respond.js";

async function tryDeleteIncoming(ctx: any) {
  try {
    if (ctx.chat?.id && ctx.message?.message_id) {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
    }
  } catch {
  }
}

function minutesText(durationSec?: number) {
  const s = Math.max(0, Number(durationSec ?? 0));
  if (!s) return "—";
  return `${Math.ceil(s / 60)} мин`;
}

export function registerAudioAdmin(bot: Telegraf<MyContext>) {
  bot.action("admin:add_audio", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return;

    const tgId = ctx.state.user.tgId;
    await AudioDraftStory.updateOne(
      { tgId },
      {
        $set: {
          tgId,
          title: "",
          priceTokens: 0,
          audioId: "",
          durationSec: 0,
          pendingInput: "title",
        },
      },
      { upsert: true }
    );

    await respond(ctx, "🎧 Добавление ГС-истории\n\nШаг 1/3: Введите название:", {
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("🗑 Отменить", "admin:audio:cancel")],
        [Markup.button.callback("↩︎ Назад", "admin")],
      ]),
    });
  });

  bot.on("message", async (ctx, next) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return next();

    const tgId = ctx.state.user.tgId;
    const draft = await AudioDraftStory.findOne({ tgId });
    if (!draft || !draft.pendingInput) return next();

    if (draft.pendingInput === "title") {
      const text = (ctx.message as any)?.text;
      if (!text) {
        await respond(ctx, "Шаг 1/3: название нужно отправить *текстом*.", {
          parseMode: "Markdown",
          inline: Markup.inlineKeyboard([[Markup.button.callback("🗑 Отменить", "admin:audio:cancel")]]),
        });
        return;
      }

      await tryDeleteIncoming(ctx); 

      draft.title = String(text).trim();
      draft.pendingInput = "price";
      await draft.save();

      await respond(ctx, `✅ Название: *${draft.title}*\n\nШаг 2/3: отправьте цену в ключах (число).`, {
        parseMode: "Markdown",
        inline: Markup.inlineKeyboard([[Markup.button.callback("🗑 Отменить", "admin:audio:cancel")]]),
      });
      return;
    }

    if (draft.pendingInput === "price") {
      const text = (ctx.message as any)?.text;
      const raw = Number(text);
      if (!Number.isFinite(raw)) {
        await respond(ctx, "Шаг 2/3: цена должна быть числом. Пример: *5*", {
          parseMode: "Markdown",
          inline: Markup.inlineKeyboard([[Markup.button.callback("🗑 Отменить", "admin:audio:cancel")]]),
        });
        return;
      }

      await tryDeleteIncoming(ctx);

      draft.priceTokens = Math.max(0, Math.floor(raw));
      draft.pendingInput = "audio";
      await draft.save();

      await respond(
        ctx,
        `✅ Цена: *${draft.priceTokens} ключей*\n\nШаг 3/3: пришлите голосовое (voice) или аудио-файл (audio).`,
        {
          parseMode: "Markdown",
          inline: Markup.inlineKeyboard([[Markup.button.callback("🗑 Отменить", "admin:audio:cancel")]]),
        }
      );
      return;
    }

    if (draft.pendingInput === "audio") {
      const voice = (ctx.message as any)?.voice;
      const audio = (ctx.message as any)?.audio;
      const doc = (ctx.message as any)?.document;

      const fileId = voice?.file_id ?? audio?.file_id ?? doc?.file_id;
      const durationSec = Number(voice?.duration ?? audio?.duration ?? 0);

      if (!fileId) {
        await respond(ctx, "Шаг 3/3: нужно прислать *voice* или *audio* (можно как файл).", {
          parseMode: "Markdown",
          inline: Markup.inlineKeyboard([[Markup.button.callback("🗑 Отменить", "admin:audio:cancel")]]),
        });
        return;
      }

      await tryDeleteIncoming(ctx); 

      draft.audioId = String(fileId);
      draft.durationSec = Math.max(0, Math.floor(durationSec));
      draft.pendingInput = "";
      await draft.save();

      const text =
        `✅ Черновик готов\n\n` +
        `Название: ${draft.title}\n` +
        `Цена: ${draft.priceTokens} ключей\n` +
        `Длина: ${minutesText(draft.durationSec)}\n\n` +
        `Сохранить?`;

      await respond(ctx, text, {
        inline: Markup.inlineKeyboard([
          [Markup.button.callback("✅ Сохранить", "admin:audio:commit")],
          [Markup.button.callback("🗑 Отменить", "admin:audio:cancel")],
          [Markup.button.callback("↩︎ В админку", "admin")],
        ]),
      });
      return;
    }

    return next();
  });

  bot.action("admin:audio:commit", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return;

    const tgId = ctx.state.user.tgId;
    const draft = await AudioDraftStory.findOne({ tgId });
    if (!draft) return;

    const title = String(draft.title || "").trim();
    const audioId = String(draft.audioId || "").trim();
    const priceTokens = Math.max(0, Math.floor(Number(draft.priceTokens ?? 0)));
    const durationSec = Math.max(0, Math.floor(Number(draft.durationSec ?? 0)));

    if (!title || !audioId) {
      return respond(ctx, "Черновик неполный. Начните заново.", {
        inline: Markup.inlineKeyboard([[Markup.button.callback("➕ Добавить", "admin:add_audio")]]),
      });
    }

    await AudioStory.create({
      title,
      audioId,
      priceTokens,
      durationSec,
      opensCount: 0,
      closesCount: 0,
      tokensSpent: 0,
    });

    await AudioDraftStory.deleteOne({ tgId });

    await respond(ctx, "✅ ГС-история добавлена.", {
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("🎧 К списку ГС", "listen_stories")],
        [Markup.button.callback("↩︎ В админку", "admin")],
      ]),
    });
  });

  bot.action("admin:audio:cancel", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.user || !isAdmin(ctx.state.user)) return;

    const tgId = ctx.state.user.tgId;
    await AudioDraftStory.deleteOne({ tgId });

    await respond(ctx, "Черновик удалён.", {
      inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админку", "admin")]]),
    });
  });
}
