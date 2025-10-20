import { buildInlineMain } from "./menus.js";
import { renderAddStoryTextScreen } from "./screens.addStoryText.js";
import { renderReadStoriesScreen } from "./screens.readStories.js";
import { renderProfileUserStatsScreen } from "./screens.profileStats.js";
import { renderAdminStatsScreen } from "./screens.adminStats.js";
import { isAdmin, isPremium } from "../../shared/utils.js";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";

export type ScreenId =
  | "main"
  | "profile"
  | "profileSubscription"
  | "profileUserStats"
  | "admin"
  | "storiesList"
  | "statistics"
  | "addStoryText"
  | "readStories";

export type ScreenPayload = {
  text: string;
  inline?: ReturnType<typeof Markup.inlineKeyboard>;
  setReplyKeyboard?: boolean;
  replyNoticeText?: string;
  parseMode?: "Markdown" | "HTML";
};

type ScreenRenderer = (
  ctx: MyContext
) => Promise<ScreenPayload> | ScreenPayload;

function formatDate(d?: string | number | Date) {
  if (!d) return "-";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}.${String(
    dt.getMonth() + 1
  ).padStart(2, "0")}.${dt.getFullYear()}`;
}

const screens: Record<ScreenId, ScreenRenderer> = {
  main: (ctx) => ({
    text: `Добро пожаловать в *Юля С "Bot"*, ${
      ctx.from?.first_name || "дорогой подписчик!"
    }!  В этом боте ты можешь прочитать уникальные истории, финал которых зависит только от твоего выбора. Приятного пользования🌸`,
    inline: buildInlineMain(ctx.state.user),
    setReplyKeyboard: true,
    replyNoticeText: "",
  }),

  profile: (ctx) => ({
    text: `Твой профиль\n\nЗдесь ты можешь посмотреть статус подписки и личную статистику.`,
    inline: Markup.inlineKeyboard([
      [
        Markup.button.callback("Подписка", "profile:subscription"),
        Markup.button.callback("Статистика", "profile:statistics"),
      ],
      [Markup.button.callback("Назад", "main")],
    ]),
  }),

  profileSubscription: (ctx) => {
    const u = ctx.state.user;
    const premium = isPremium(u);
    const expiresAt = (u as any)?.premiumUntil;
    const base = premium
      ? `✅ У тебя активная подписка.\nДействует до: <b>${formatDate(
          expiresAt
        )}</b>.`
      : `❌ Подписка не активна.`;

    return {
      text: `${base}\n\nПодписка открывает дополнительные истории и будущие фичи.`,
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ В профиль", "profile")],
        [Markup.button.callback("🏠 На главную", "main")],
      ]),
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
        [Markup.button.callback("🧑‍💻СТАТИСТИКА🧑‍💻", "admin:statistics")],
        [Markup.button.callback("Обложки", "admin:cover_list")],
        [
          Markup.button.callback(
            "📜ДОБАВИТЬ ИСТОРИЮ📜",
            "admin:add_story_text"
          ),
        ],
        [Markup.button.callback("📨Добавить файл📨", "admin:import_file")],
        [Markup.button.callback("🗑Удалить историю🗑", "admin:delete_list")],
        [Markup.button.callback('📣 Рассылка', 'admin:broadcast')],
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

  profileUserStats: (ctx) => renderProfileUserStatsScreen(ctx),

  statistics: (ctx) => renderAdminStatsScreen(ctx),
};

export function getScreen(ctx: MyContext, id: ScreenId): ScreenPayload {
  const r = screens[id];
  if (!r)
    return { text: "Экран не найден", inline: buildInlineMain(undefined) };
  return r(ctx) as ScreenPayload;
}
