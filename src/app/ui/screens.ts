import { buildInlineMain } from "./menus.js";
import { renderAddStoryTextScreen } from "./screens.addStoryText.js";
import { renderReadStoriesScreen } from "./screens.readStories.js";
import { renderProfileUserStatsScreen } from "./screens.profileStats.js";
import { renderListenStoriesScreen } from "./screens.listenStories.js";
import { renderAdminStatsAudioScreen } from "./screens.adminStats.js";
import { renderAdminStoriesBriefScreen } from "./screens.adminStoriesBrief.js";
import { isAdmin } from "../../shared/utils.js";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { getBalance } from "../../features/tokens/wallet.service.js";
import { Types } from "mongoose";

import {
  MAIN_TEXT_DEFAULT,
  NEW_USER_WELCOME_WINDOW_MS,
  NEW_USER_PAGES,
} from "./texts.main.js";
import { renderHelpIndexScreen } from "./screens.help.js";
import { User } from "../../db/models/User.js";

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
  | "adminStats"
  | "adminStories"
  | "adminMarketing"
  | "adminInteractive"
  | "storiesList"
  | "statistics_audio"
  | "adminStoriesBrief"
  | "addStoryText"
  | "readStories"
  | "buyTokens"
  | "help"
  | "listenStories";

export type ScreenPayload = {
  text: string;
  inline?: ReturnType<typeof Markup.inlineKeyboard>;
  setReplyKeyboard?: boolean;
  replyNoticeText?: string;
  parseMode?: "Markdown" | "HTML";
};

type ScreenRenderer = (ctx: MyContext) => Promise<ScreenPayload> | ScreenPayload;

function isNewUser(createdAt?: any) {
  if (!createdAt) return false;
  const ts = new Date(createdAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= NEW_USER_WELCOME_WINDOW_MS;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function mergeInlineKeyboards(
  topRows: any[][],
  base: ReturnType<typeof Markup.inlineKeyboard>
) {
  const baseKb = (base as any)?.reply_markup?.inline_keyboard ?? [];
  return Markup.inlineKeyboard([...topRows, ...baseKb]);
}

function buildNewUserPager(page: number, total: number) {
  const prev = page > 0 ? `welcome:p:${page - 1}` : "noop";
  const next = page < total - 1 ? `welcome:p:${page + 1}` : "noop";
  return [
    [
      Markup.button.callback("⬅️ Назад", prev),
      Markup.button.callback("Далее ➡️", next),
    ],
  ];
}

function requireAdminOrDeny(ctx: MyContext): ScreenPayload | null {
  if (!ctx.state.user || !isAdmin(ctx.state.user)) {
    return {
      text: "Доступ только для админа.",
      inline: buildInlineMain(undefined),
      parseMode: "HTML",
    };
  }
  return null;
}

const screens: Record<ScreenId, ScreenRenderer> = {
  main: (ctx) => {
    const name = ctx.from?.first_name || "друг!";
    const userCreatedAt = (ctx.state.user as any)?.createdAt;

    const baseInline = buildInlineMain(ctx.state.user);

    if (isNewUser(userCreatedAt)) {
      const pages = NEW_USER_PAGES(name);
      const total = pages.length;

      const rawPage = Number((ctx.state as any)?.welcomePage ?? 0);
      const page = clamp(rawPage, 0, total - 1);

      const pageHeader =
        page === 0 ? "" : `<i>(подсказка ${page + 1}/${total})</i>\n\n`;
      const text = pageHeader + pages[page];

      const pagerRows = buildNewUserPager(page, total);
      const inline = mergeInlineKeyboards(pagerRows, baseInline);

      return {
        text,
        inline,
        setReplyKeyboard: true,
        replyNoticeText: "",
        parseMode: "HTML" as const,
      };
    }

    return {
      text: MAIN_TEXT_DEFAULT(name),
      inline: baseInline,
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
        `👤 <b>Твой профиль</b>\n\n` +
        `${balanceText}\n\n` +
        `Здесь можно посмотреть личную статистику и быстро перейти к полезным разделам.`,
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
      "Выберите подходящий пакет ниже — после выбора бот покажет подтверждение." +
      balanceText;

    const rows = TOKEN_PACKS.map((p) => [
      Markup.button.callback(
        `${p.tokens} ключ(ей) — ${p.priceRub}₽`,
        `buy_tokens:confirm:${p.id}`
      ),
    ]);

    rows.push([Markup.button.callback("↩︎ В главное меню", "main")]);

    return {
      text,
      inline: Markup.inlineKeyboard(rows),
      parseMode: "HTML",
    };
  },

  // ===== ADMIN (уровень 1) =====
  admin: async (ctx) => {
    const deny = requireAdminOrDeny(ctx);
    if (deny) return deny;

    const usersCount = await User.countDocuments();

    return {
      text: `<b>🛠 Админ-панель</b>

<b>👥 Пользователей в боте:</b> ${usersCount}

Здесь собраны инструменты управления ботом: статистика, истории, рассылки и интерактив для подписчиков.
Выберите нужный раздел ниже 👇`,
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("📊 Статистика", "admin:stats")],
        [Markup.button.callback("📚 Истории", "admin:stories")],
        [Markup.button.callback("📣 Маркетинг", "admin:marketing")],
        [Markup.button.callback("🎮 Интерактив для подписчиков", "admin:interactive")],
        [Markup.button.callback("⬅️ Назад", "main")],
      ]),
      parseMode: "HTML",
    };
  },

  // ===== ADMIN (уровень 2) =====
  adminStats: async (ctx) => {
    const deny = requireAdminOrDeny(ctx);
    if (deny) return deny;

    return {
      text: `<b>📊 Админ → Статистика</b>

Здесь можно посмотреть ключевые метрики и быстрые сводки по контенту.
Выберите, что открыть:`,
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("🧑‍💻 Статистика ГС-историй", "admin:statistics_audio")],
        [Markup.button.callback("📌 Последние / черновики", "admin:stories_brief")],
        [Markup.button.callback("⬅️ Назад", "admin")],
      ]),
      parseMode: "HTML",
    };
  },

  adminStories: async (ctx) => {
    const deny = requireAdminOrDeny(ctx);
    if (deny) return deny;

    return {
      text: `<b>📚 Админ → Истории</b>

Управление историями и материалами:
— добавление текстовых и ГС-историй,
— обложки,
— импорт файлов,
— удаление контента.

Выберите действие:`,
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("📜 Добавить текстовую историю", "admin:add_story_text")],
        [Markup.button.callback("🎧 Добавить ГС-историю", "admin:add_audio")],
        [Markup.button.callback("🖼 Обложки", "admin:cover_list")],
        [Markup.button.callback("📨 Импорт / добавить файл", "admin:import_file")],
        [Markup.button.callback("🗑 Удалить историю", "admin:delete_list")],
        [Markup.button.callback("⬅️ Назад", "admin")],
      ]),
      parseMode: "HTML",
    };
  },

  adminMarketing: async (ctx) => {
    const deny = requireAdminOrDeny(ctx);
    if (deny) return deny;

    return {
      text: `<b>📣 Админ → Маркетинг</b>

Коммуникации с аудиторией и управление каналами:
— рассылки,
— список обязательных каналов/подписок.

Выберите действие:`,
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("📣 Рассылка", "admin:broadcast")],
        [Markup.button.callback("📢 Каналы", "admin:channels")],
        [Markup.button.callback("⬅️ Назад", "admin")],
      ]),
      parseMode: "HTML",
    };
  },

  adminInteractive: async (ctx) => {
    const deny = requireAdminOrDeny(ctx);
    if (deny) return deny;

    return {
      text: `<b>🎮 Интерактив для подписчиков</b>

Здесь будут инструменты вовлечения аудитории:
— опросы и голосования,
— конкурсы / подарочные ключи,
— интерактивные активности в каналах.

Пока раздел в разработке — но сюда будем складывать всё “живое” 😊`,
      inline: Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Назад", "admin")],
      ]),
      parseMode: "HTML",
    };
  },

  // ===== остальное =====
  storiesList: () => ({
    text: "Список историй (заглушка)",
    inline: Markup.inlineKeyboard([[Markup.button.callback("⬅️ Назад", "admin")]]),
    parseMode: "HTML",
  }),

  help: (ctx) => renderHelpIndexScreen(ctx),

  adminStoriesBrief: (ctx) => renderAdminStoriesBriefScreen(ctx),

  addStoryText: (ctx) => renderAddStoryTextScreen(ctx),
  readStories: (ctx) => renderReadStoriesScreen(ctx),
  listenStories: (ctx) => renderListenStoriesScreen(ctx),

  profileUserStats: (ctx) => renderProfileUserStatsScreen(ctx),

  statistics_audio: (ctx) => renderAdminStatsAudioScreen(ctx),
};

export function getScreen(ctx: MyContext, id: ScreenId): ScreenPayload {
  const r = screens[id];
  if (!r) {
    return {
      text: "Экран не найден",
      inline: buildInlineMain(undefined),
      parseMode: "HTML",
    };
  }
  return r(ctx) as ScreenPayload;
}
