import { buildInlineMain } from "./menus.js";import { renderAddStoryTextScreen } from "./screens.addStoryText.js";
import { renderReadStoriesScreen } from "./screens.readStories.js";
import { renderProfileUserStatsScreen } from "./screens.profileStats.js";
import { renderListenStoriesScreen } from "./screens.listenStories.js";
import { renderAdminStatsAudioScreen } from "./screens.adminStats.js";
import { isAdmin } from "../../shared/utils.js";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { getBalance } from "../../features/tokens/wallet.service.js";
import { Types } from "mongoose";
import {
  MAIN_TEXT_DEFAULT,
  MAIN_TEXT_NEW_USER,
  NEW_USER_WELCOME_WINDOW_MS,
} from "./texts.main.js";

const TOKEN_PACKS = [
  { id: "p6", tokens: 6, priceRub: 100 },
  { id: "p13", tokens: 13, priceRub: 200 },
  { id: "p21", tokens: 21, priceRub: 333 },
  { id: "p35", tokens: 35, priceRub: 500 },
  { id: "p80", tokens: 80, priceRub: 1100 },
] as const;

export type TokenPackId = (typeof TOKEN_PACKS)[number]["id"];

export type ScreenId =
  | "main"
  | "profile"
  | "profileUserStats"
  | "admin"
  | "storiesList"
  | "statistics_audio"
  | "addStoryText"
  | "readStories"
  | "buyTokens"
  | "listenStories";

export type ScreenPayload = {
  text: string;
  inline?: ReturnType<typeof Markup.inlineKeyboard>;
  setReplyKeyboard?: boolean;
  replyNoticeText?: string;
  parseMode?: "Markdown" | "HTML";
};

type ScreenRenderer = (
  ctx: MyContext,
) => Promise<ScreenPayload> | ScreenPayload;

function isNewUser(createdAt?: any) {
  if (!createdAt) return false;
  const ts = new Date(createdAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= NEW_USER_WELCOME_WINDOW_MS;
}

const screens: Record<ScreenId, ScreenRenderer> = {
  main: (ctx) => {
    const name = ctx.from?.first_name || "друг!";
    const userCreatedAt = (ctx.state.user as any)?.createdAt;

    const text = isNewUser(userCreatedAt)
      ? MAIN_TEXT_NEW_USER(name)
      : MAIN_TEXT_DEFAULT(name);

    return {
      text,
      inline: buildInlineMain(ctx.state.user),
      setReplyKeyboard: true,
      replyNoticeText: "",
      parseMode: "Markdown" as const,
    };
  },
  profile: async (ctx) => {
    const u = ctx.state.user;
    const userId = (u as any)?._id as Types.ObjectId | undefined;

    let balanceText = "Баланс: -";
    if (userId) {
      const balance = await getBalance(userId);
      balanceText = `Баланс ключей: <b>${balance}</b>`;
    }

    return {
      text:
        `Твой профиль\n\n` +
        `${balanceText}\n\n` +
        `Здесь можно посмотреть личную статистику.`,
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("📊 Статистика", "profile:statistics")],
        [Markup.button.callback("🏠 На главную", "main")],
      ]),
      parseMode: "HTML",
    };
  },

  buyTokens: async (ctx) => {
    const u = ctx.state.user;
    const userId = (u as any)?._id as Types.ObjectId | undefined;

    let balanceText = "";
    if (userId) {
      const balance = await getBalance(userId);
      balanceText = `\n\nТекущий баланс: <b>${balance}</b> ключ(ей).`;
    }

    const legend =
      "ℹ️ Ключи нужны, чтобы открывать дополнительные концовки и платные истории.\n";

    const text =
      "💰 <b>Покупка ключей</b>\n\n" +
      legend +
      "Выберите подходящий пакет:" +
      balanceText;

    const rows = TOKEN_PACKS.map((p) => [
      Markup.button.callback(
        `${p.tokens} ключ(ей) — ${p.priceRub}₽`,
        `buy_tokens:confirm:${p.id}`,
      ),
    ]);

    rows.push([Markup.button.callback("↩︎ В главное меню", "main")]);

    return {
      text,
      inline: Markup.inlineKeyboard(rows),
      parseMode: "HTML",
    };
  },

  admin: (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) {
      return {
        text: "Доступ только для админа.",
        inline: buildInlineMain(undefined),
      };
    }
    return {
      text: "Админ-панель",
      inline: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🧑‍💻 Статистика ГС-историй",
            "admin:statistics_audio",
          ),
        ],
        [Markup.button.callback("Обложки", "admin:cover_list")],
        [Markup.button.callback("📜 Добавить историю", "admin:add_story_text")],
        [Markup.button.callback("🎧 Добавить ГС-историю", "admin:add_audio")],
        [Markup.button.callback("📨 Добавить файл", "admin:import_file")],
        [Markup.button.callback("🗑 Удалить историю", "admin:delete_list")],
        [Markup.button.callback("📣 Рассылка", "admin:broadcast")],
        [Markup.button.callback("📢 Каналы", "admin:channels")],
        [Markup.button.callback("Назад", "main")],
      ]),
    };
  },

  storiesList: () => ({
    text: "Список историй (заглушка)",
    inline: Markup.inlineKeyboard([[Markup.button.callback("Назад", "admin")]]),
  }),

  addStoryText: (ctx) => renderAddStoryTextScreen(ctx),
  readStories: (ctx) => renderReadStoriesScreen(ctx),
  listenStories: (ctx) => renderListenStoriesScreen(ctx),

  profileUserStats: (ctx) => renderProfileUserStatsScreen(ctx),

  statistics_audio: (ctx) => renderAdminStatsAudioScreen(ctx),
};

export function getScreen(ctx: MyContext, id: ScreenId): ScreenPayload {
  const r = screens[id];
  if (!r)
    return { text: "Экран не найден", inline: buildInlineMain(undefined) };
  return r(ctx) as ScreenPayload;
}
