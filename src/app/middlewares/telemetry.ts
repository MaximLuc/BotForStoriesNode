import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../../shared/types.js";

type Kind = "cb" | "msg" | "cmd" | "other";

function safe(s: any) {
  const t = String(s ?? "");
  return t.length > 180 ? t.slice(0, 180) + "…" : t;
}

function extractEvent(
  ctx: MyContext
): { kind: Kind; action?: string; text?: string } {
  if (
    ctx.callbackQuery &&
    typeof ctx.callbackQuery === "object" &&
    "data" in (ctx.callbackQuery as any)
  ) {
    return { kind: "cb", action: String((ctx.callbackQuery as any).data) };
  }

  const m: any = (ctx as any).message;
  if (m?.text) {
    const text = String(m.text);
    if (text.startsWith("/")) return { kind: "cmd", text };
    return { kind: "msg", text };
  }

  return { kind: "other" };
}

function shortId(id: string, n = 6) {
  const t = String(id ?? "");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function parseEndingChoose(
  action: string
): { storyId: string; idx: number } | null {
  const m = action.match(/^read:choose:([^:]+):(\d+)$/);
  if (!m) return null;
  return { storyId: m[1], idx: Number(m[2]) };
}

function parseStoryOpen(action: string): { storyId: string } | null {
  const m = action.match(/^story:([^:]+)$/);
  if (!m) return null;
  if (action.startsWith("story:buy:")) return null;
  return { storyId: m[1] };
}

function parseStoryBuy(action: string): { storyId: string } | null {
  const m = action.match(/^story:buy:([^:]+)$/);
  if (!m) return null;
  return { storyId: m[1] };
}

function parseStoryPage(
  action: string
): { storyId: string; page: number } | null {
  const m = action.match(/^read:story:([^:]+):p:(\d+)$/);
  if (!m) return null;
  return { storyId: m[1], page: Number(m[2]) };
}

function parseEndingPage(
  action: string
): { storyId: string; idx: number; page: number } | null {
  const m = action.match(/^read:end:([^:]+):(\d+):p:(\d+)$/);
  if (!m) return null;
  return { storyId: m[1], idx: Number(m[2]), page: Number(m[3]) };
}

function parseReadListFrom(action: string): { storyId: string } | null {
  const m = action.match(/^read:list_from:([^:]+)$/);
  if (!m) return null;
  return { storyId: m[1] };
}

function parseReadStoriesPage(action: string): { page: number } | null {
  const m = action.match(/^read_stories:page:(\d+)$/);
  if (!m) return null;
  return { page: Number(m[1]) };
}

function parseListenStoriesPage(action: string): { page: number } | null {
  const m = action.match(/^listen_stories:page:(\d+)$/);
  if (!m) return null;
  return { page: Number(m[1]) };
}

function parseBuyTokensConfirm(action: string): { packId: string } | null {
  const m = action.match(/^buy_tokens:confirm:(.+)$/);
  if (!m) return null;
  return { packId: m[1] };
}

function parseBuyEndingConfirm(
  action: string
): { storyId: string; idx: number } | null {
  const m = action.match(/^ending:buy:confirm:([^:]+):(\d+)$/);
  if (!m) return null;
  return { storyId: m[1], idx: Number(m[2]) };
}

function parseAudioOpen(action: string): { audioId: string } | null {
  const m = action.match(/^audio:open:([^:]+)$/);
  if (!m) return null;
  return { audioId: m[1] };
}

/** ✅ NEW: help sections */
function parseHelpSection(action: string): { section: string } | null {
  const m = action.match(/^help:(general|stories|audio|keys|buttons|other)$/);
  if (!m) return null;
  return { section: m[1] };
}

function helpSectionLabel(section: string) {
  if (section === "general") return "📌 помощь: Общее";
  if (section === "stories") return "📖 помощь: Истории";
  if (section === "audio") return "🎧 помощь: Аудио-истории";
  if (section === "keys") return "🗝 помощь: Ключи";
  if (section === "buttons") return "🔘 помощь: Описание кнопок";
  if (section === "other") return "❓ помощь: Другое";
  return `помощь: ${section}`;
}

function labelForAction(action: string): { label: string; known: boolean } {
  // базовые меню
  if (action === "main") return { label: "главное меню", known: true };
  if (action === "profile") return { label: "профиль", known: true };
  if (action === "profile:statistics")
    return { label: "открыл статистику профиля", known: true };

  // help index
  if (action === "help") return { label: "помощь (разделы)", known: true };
  if (action === "support") return { label: "техподдержка", known: true };

  // ✅ help sections (if вдруг парсер не отработал, всё равно считаем known)
  if (action.startsWith("help:"))
    return { label: "открыл раздел помощи", known: true };

  // текстовые истории
  if (action === "read_stories")
    return { label: "открыл список текстовых историй", known: true };
  if (action.startsWith("read_stories:page:"))
    return { label: "листает список текстовых историй", known: true };

  // ГС истории
  if (action === "listen_stories")
    return { label: "открыл список ГС-историй", known: true };
  if (action.startsWith("listen_stories:page:"))
    return { label: "листает список ГС-историй", known: true };

  // открытие/покупка истории
  if (action.startsWith("story:buy:"))
    return { label: "покупает доступ к истории", known: true };
  if (action.startsWith("story:"))
    return { label: "открыл историю", known: true };

  // чтение страниц/концовок
  if (action.startsWith("read:story:"))
    return { label: "листает страницы истории", known: true };
  if (action.startsWith("read:choose:"))
    return { label: "выбрал концовку", known: true };
  if (action.startsWith("read:end:"))
    return { label: "читает концовку", known: true };
  if (action.startsWith("read:list_from:"))
    return { label: "вернулся к списку историй", known: true };

  // ГС действия
  if (action.startsWith("audio:open:"))
    return { label: "открыл ГС-историю", known: true };
  if (action.startsWith("audio:play:"))
    return { label: "слушает ГС-историю", known: true };
  if (action.startsWith("audio:buy:"))
    return { label: "покупает ГС-историю", known: true };
  if (action.startsWith("audio:close:"))
    return { label: "вернулся к списку ГС", known: true };

  // ключи / покупки
  if (action === "buy_tokens")
    return { label: "меню покупки ключей", known: true };
  if (action.startsWith("buy_tokens:confirm:"))
    return { label: "выбрал пакет ключей", known: true };
  if (action.startsWith("ending:buy:confirm:"))
    return { label: "покупает концовку", known: true };

  // подписки
  if (action === "check_subscriptions")
    return { label: "проверяет подписку на каналы", known: true };

  // админка (как ты просил — базовые оставляем)
  if (action === "admin") return { label: "админка", known: true };
  if (action === "admin:statistics_audio")
    return { label: "статистика ГС (админ)", known: true };
  if (action === "admin:add_audio")
    return { label: "добавляет ГС (админ)", known: true };
  if (action === "admin:add_story_text")
    return { label: "добавляет текстовую историю (админ)", known: true };
  if (action === "admin:stories_brief")
    return { label: "сводка по историям (админ)", known: true };

  return { label: "неизвестное действие", known: false };
}

export const telemetry: MiddlewareFn<MyContext> = async (ctx, next) => {
  const u = ctx.state.user as any;
  const firstName = ctx.from?.first_name ?? u?.firstName ?? "-";
  const role = u?.role ?? "-";

  const { kind, action, text } = extractEvent(ctx);

  if (kind === "cb" && action) {
    // ✅ NEW: help section logs
    const hs = parseHelpSection(action);
    if (hs) {
      console.log(`🆘 @${firstName} role=${role} | ${helpSectionLabel(hs.section)}`);
      return next();
    }

    const ending = parseEndingChoose(action);
    if (ending) {
      console.log(
        `🎭 @${firstName} role=${role} | выбрал концовку | story=${shortId(
          ending.storyId
        )} ending#${ending.idx + 1}`
      );
      return next();
    }

    const open = parseStoryOpen(action);
    if (open) {
      console.log(
        `📖 @${firstName} role=${role} | открыл историю | story=${shortId(
          open.storyId
        )}`
      );
      return next();
    }

    const buy = parseStoryBuy(action);
    if (buy) {
      console.log(
        `💠 @${firstName} role=${role} | покупает историю | story=${shortId(
          buy.storyId
        )}`
      );
      return next();
    }

    const sp = parseStoryPage(action);
    if (sp) {
      console.log(
        `📄 @${firstName} role=${role} | листает историю | story=${shortId(
          sp.storyId
        )} page=${sp.page + 1}`
      );
      return next();
    }

    const ep = parseEndingPage(action);
    if (ep) {
      console.log(
        `📄 @${firstName} role=${role} | читает концовку | story=${shortId(
          ep.storyId
        )} ending#${ep.idx + 1} page=${ep.page + 1}`
      );
      return next();
    }

    const back = parseReadListFrom(action);
    if (back) {
      console.log(
        `↩️ @${firstName} role=${role} | к списку историй | from_story=${shortId(
          back.storyId
        )}`
      );
      return next();
    }

    const rlp = parseReadStoriesPage(action);
    if (rlp) {
      console.log(
        `📚 @${firstName} role=${role} | листает список текстовых | page=${
          rlp.page + 1
        }`
      );
      return next();
    }

    const alp = parseListenStoriesPage(action);
    if (alp) {
      console.log(
        `🎧 @${firstName} role=${role} | листает список ГС | page=${alp.page + 1}`
      );
      return next();
    }

    const pack = parseBuyTokensConfirm(action);
    if (pack) {
      console.log(
        `💰 @${firstName} role=${role} | выбрал пакет ключей | pack=${pack.packId}`
      );
      return next();
    }

    const bec = parseBuyEndingConfirm(action);
    if (bec) {
      console.log(
        `🔓 @${firstName} role=${role} | покупает концовку | story=${shortId(
          bec.storyId
        )} ending#${bec.idx + 1}`
      );
      return next();
    }

    const ao = parseAudioOpen(action);
    if (ao) {
      console.log(
        `🎧 @${firstName} role=${role} | открыл ГС | audio=${shortId(ao.audioId)}`
      );
      return next();
    }

    const { label, known } = labelForAction(action);
    if (known) {
      console.log(`📍 @${firstName} role=${role} | ${label}`);
    } else {
      console.log(
        `❓ @${firstName} role=${role} | unknown_action=${safe(action)}`
      );
    }
  } else if (kind === "cmd" && text) {
    console.log(`⌨️ @${firstName} role=${role} | command=${safe(text)}`);
  } else if (kind === "msg" && text) {
    console.log(`💬 @${firstName} role=${role} | message=${safe(text)}`);
  }

  return next();
};
