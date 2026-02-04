import type { MiddlewareFn } from "telegraf";
import type { MyContext } from "../../shared/types.js";

type Kind = "cb" | "msg" | "cmd" | "other";

function safe(s: any) {
  const t = String(s ?? "");
  return t.length > 180 ? t.slice(0, 180) + "…" : t;
}

function extractEvent(ctx: MyContext): { kind: Kind; action?: string; text?: string } {
  if (ctx.callbackQuery && typeof ctx.callbackQuery === "object" && "data" in ctx.callbackQuery) {
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

function parseEndingChoose(action: string): { storyId: string; idx: number } | null {
  const m = action.match(/^read:choose:([^:]+):(\d+)$/);
  if (!m) return null;
  return { storyId: m[1], idx: Number(m[2]) };
}

function labelForAction(action: string): string {
  if (action === "main") return "главное меню";
  if (action === "profile") return "профиль";
  if (action === "help") return "помощь";
  if (action === "support") return "техподдержка";

  if (action === "read_stories") return "список текстовых историй";
  if (action.startsWith("read_stories:page:")) return "листает текстовые истории";

  if (action === "listen_stories") return "список ГС-историй";
  if (action.startsWith("listen_stories:page:")) return "листает ГС-истории";

  if (action.startsWith("story:")) return "открыл текстовую историю";

  if (/^read:choose:/.test(action)) return "выбрал концовку";

  if (action.startsWith("audio:open:")) return "открыл ГС-историю";
  if (action.startsWith("audio:play:")) return "слушает ГС-историю";
  if (action.startsWith("audio:buy:")) return "покупает ГС-историю";
  if (action.startsWith("audio:close:")) return "вернулся к списку ГС";

  if (action === "buy_tokens") return "меню покупки ключей";
  if (action.startsWith("buy_tokens:confirm:")) return "выбрал пакет ключей";
  if (action.startsWith("ending:buy:confirm:")) return "покупает концовку";

  if (action === "admin") return "админка";
  if (action === "admin:statistics_audio") return "статистика ГС (админ)";
  if (action === "admin:add_audio") return "добавляет ГС (админ)";
  if (action === "admin:add_story_text") return "добавляет текстовую историю (админ)";

  return "нажал кнопку";
}

export const telemetry: MiddlewareFn<MyContext> = async (ctx, next) => {
  const u = ctx.state.user as any;
  const firstName = ctx.from?.first_name ?? u?.firstName ?? "-";
  const role = u?.role ?? "-";

  const { kind, action, text } = extractEvent(ctx);

  if (kind === "cb" && action) {
    const label = labelForAction(action);

    const ending = parseEndingChoose(action);
    if (ending) {
      console.log(
        `🎭 @${firstName} role=${role} | ${label} | story=${shortId(ending.storyId)} ending#${ending.idx + 1}`
      );
      return next();
    }

    console.log(`📍 @${firstName} role=${role} | ${label}`);
  } else if (kind === "cmd" && text) {
    console.log(`⌨️ @${firstName} role=${role} | command=${safe(text)}`);
  } else if (kind === "msg" && text) {
    console.log(`💬 @${firstName} role=${role} | message=${safe(text)}`);
  }

  return next();
};
