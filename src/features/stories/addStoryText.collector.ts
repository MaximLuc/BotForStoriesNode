import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { isAdmin } from "../../shared/utils.js";
import { getOrCreateDraft, resetPending } from "./draft.service.js";
import { aggPush } from "./input.aggregator.js";
import { Story } from "../../db/models/Story.js";
import { Markup } from "telegraf";
import { safeEdit } from "../../app/ui/respond.js";
import { tryDeleteUserMessagesHard } from "./tryDelete.js";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDtLocal(dt: Date) {
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)} ${pad(dt.getHours())}:${pad(
    dt.getMinutes()
  )}`;
}

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


function parsePublishAt(input: string, now = new Date()): Date | null {
  const s = (input ?? "").trim();


  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    const dt = new Date(now);
    dt.setHours(hh, mm, 0, 0);

    if (dt.getTime() <= now.getTime()) dt.setDate(dt.getDate() + 1);
    return dt;
  }

  m = s.match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const dd = Number(m[1]);
    const mon = Number(m[2]);
    const hh = Number(m[3]);
    const mm = Number(m[4]);
    if (mon < 1 || mon > 12 || dd < 1 || dd > 31) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    const year = now.getFullYear();
    const dt = new Date(year, mon - 1, dd, hh, mm, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }


  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const dd = Number(m[1]);
    const mon = Number(m[2]);
    const yyyy = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    if (mon < 1 || mon > 12 || dd < 1 || dd > 31) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    if (yyyy < 2000 || yyyy > 2100) return null;

    const dt = new Date(yyyy, mon - 1, dd, hh, mm, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  return null;
}

function storyStatusLine(s: any | null | undefined) {
  if (!s) return "Статус: —";
  if (s.isPublished) {
    const dt = s.publishedAt ? formatDtLocal(new Date(s.publishedAt)) : "—";
    return `Статус: <b>опубликована</b> ✅\nОпубликовано: <b>${dt}</b>`;
  }
  if (s.publishAt) {
    return `Статус: <b>запланирована</b> ⏱\nПубликация: <b>${formatDtLocal(
      new Date(s.publishAt)
    )}</b>`;
  }
  return "Статус: <b>черновик</b> 📝";
}

async function renderPublishChoice(ctx: MyContext, storyId: string, hint?: string) {
  const s = (await Story.findById(storyId).lean()) as any | null;
  const title = s?.title ? html(String(s.title)) : "история";

  const text =
    (hint ? `${hint}\n\n` : "") +
    `История: <b>${title}</b>\n` +
    `${storyStatusLine(s)}\n\n` +
    `Выберите способ публикации:`;

  const inline = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Опубликовать сейчас", `story:publish_now:${storyId}`)],
    [Markup.button.callback("⏱ Запланировать", `story:schedule_menu:${storyId}`)],
    [Markup.button.callback("🕐 Авто: через 1 минуту", `story:schedule_quick:${storyId}:m1`)],
    [Markup.button.callback("➕ Добавить обложку", `cover:add:${storyId}`)],
    [Markup.button.callback("↩︎ В админку", "admin")],
  ]);

  await safeEdit(ctx, text, inline as any, "HTML");
}

export function registerDraftInputCollector(bot: Telegraf<MyContext>) {
  bot.on("message", async (ctx, next) => {
    const u = ctx.state.user;
    if (!u || !isAdmin(u)) return next();

    const msg: any = ctx.message;
    const chunk: string | undefined =
      typeof msg?.text === "string"
        ? msg.text
        : typeof msg?.caption === "string"
        ? msg.caption
        : undefined;

    if (!chunk) return next();

    const d = await getOrCreateDraft(u.tgId);
    if (!d.pendingInput) return next();

    const p = d.pendingInput as any;


    if (p.kind === "publishAtDirect") {
      const storyId = String(p.storyId ?? "");
      if (!storyId) {
        await resetPending(u.tgId);
        return safeEdit(
          ctx,
          "Ошибка: не найден storyId для планирования.",
          Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админку", "admin")]]),
          "HTML"
        );
      }

      const now = new Date();
      const dt = parsePublishAt(chunk, now);

      if (!dt) {
      
        try {
          await tryDeleteUserMessagesHard(ctx, ctx.chat!.id, [msg.message_id]);
        } catch {}

        return renderPublishChoice(
          ctx,
          storyId,
          `❌ Не понял формат. Пример: <b>18:30</b> или <b>05.02 09:15</b>`
        );
      }


      if (dt.getTime() < now.getTime() + 30_000) {
        try {
          await tryDeleteUserMessagesHard(ctx, ctx.chat!.id, [msg.message_id]);
        } catch {}

        return renderPublishChoice(
          ctx,
          storyId,
          `❌ Время должно быть в будущем (хотя бы через 1 минуту).`
        );
      }

      await Story.updateOne(
        { _id: storyId, isPublished: false },
        { $set: { publishAt: dt }, $unset: { publishedAt: "" } }
      );

      await resetPending(u.tgId);


      try {
        await tryDeleteUserMessagesHard(ctx, ctx.chat!.id, [msg.message_id]);
      } catch {}

     
      return renderPublishChoice(
        ctx,
        storyId,
        `✅ Время сохранено: <b>${formatDtLocal(dt)}</b>`
      );
    }


    aggPush(ctx, chunk);
  });
}
