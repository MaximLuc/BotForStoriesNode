import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { isAdmin } from "../../shared/utils.js";
import { getOrCreateDraft, resetPending } from "./draft.service.js";
import { aggPush } from "./input.aggregator.js";
import { Story } from "../../db/models/Story.js";
import { Markup } from "telegraf";
import { safeEdit } from "../../app/ui/respond.js";
import { tryDeleteUserMessagesHard } from "./tryDelete.js";

/** =========================
 *  TZ helpers (MSK fixed)
 *  ========================= */
const MSK_OFFSET_MIN = 180; // UTC+3

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Форматируем дату "как МСК" независимо от TZ сервера
function formatDtMsk(utcDate: Date) {
  const ms = utcDate.getTime() + MSK_OFFSET_MIN * 60_000;
  const d = new Date(ms);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )}`;
}

// Создаём UTC Date из "компонентов МСК"
function mskPartsToUtc(yyyy: number, mon0: number, dd: number, hh: number, mm: number) {
  const msUtc = Date.UTC(yyyy, mon0, dd, hh, mm, 0, 0) - MSK_OFFSET_MIN * 60_000;
  return new Date(msUtc);
}

// Парсим ввод админа как МСК → возвращаем UTC Date
function parsePublishAtMsk(input: string, nowUtc = new Date()): Date | null {
  const s = (input ?? "").trim();

  // текущее время в МСК (через сдвиг), но читаем через UTC-геттеры
  const nowMskMs = nowUtc.getTime() + MSK_OFFSET_MIN * 60_000;
  const nowMsk = new Date(nowMskMs);

  const curY = nowMsk.getUTCFullYear();
  const curM = nowMsk.getUTCMonth();
  const curD = nowMsk.getUTCDate();

  // HH:MM
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    let dtUtc = mskPartsToUtc(curY, curM, curD, hh, mm);

    // если уже прошло в МСК — на завтра
    const candMskMs = dtUtc.getTime() + MSK_OFFSET_MIN * 60_000;
    if (candMskMs <= nowMskMs) {
      dtUtc = mskPartsToUtc(curY, curM, curD + 1, hh, mm);
    }
    return dtUtc;
  }

  // DD.MM HH:MM
  m = s.match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const dd = Number(m[1]);
    const mon = Number(m[2]);
    const hh = Number(m[3]);
    const mm = Number(m[4]);
    if (mon < 1 || mon > 12 || dd < 1 || dd > 31) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    return mskPartsToUtc(curY, mon - 1, dd, hh, mm);
  }

  // DD.MM.YYYY HH:MM
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

    return mskPartsToUtc(yyyy, mon - 1, dd, hh, mm);
  }

  return null;
}

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function storyStatusLine(s: any | null | undefined) {
  if (!s) return "Статус: —";
  if (s.isPublished) {
    const dt = s.publishedAt ? formatDtMsk(new Date(s.publishedAt)) : "—";
    return `Статус: <b>опубликована</b> ✅\nОпубликовано (МСК): <b>${dt}</b>`;
  }
  if (s.publishAt) {
    return `Статус: <b>запланирована</b> ⏱\nПубликация (МСК): <b>${formatDtMsk(
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

      const nowUtc = new Date();
      const dtUtc = parsePublishAtMsk(chunk, nowUtc);

      if (!dtUtc) {
        try {
          await tryDeleteUserMessagesHard(ctx, ctx.chat!.id, [msg.message_id]);
        } catch {}

        return renderPublishChoice(
          ctx,
          storyId,
          `❌ Не понял формат. Пример: <b>18:30</b> или <b>05.02 09:15</b>`
        );
      }

      if (dtUtc.getTime() < nowUtc.getTime() + 60_000) {
        try {
          await tryDeleteUserMessagesHard(ctx, ctx.chat!.id, [msg.message_id]);
        } catch {}

        return renderPublishChoice(ctx, storyId, `❌ Время должно быть в будущем (минимум +1 мин).`);
      }

      await Story.updateOne(
        { _id: storyId, isPublished: false },
        { $set: { publishAt: dtUtc }, $unset: { publishedAt: "" } }
      );

      await resetPending(u.tgId);

      try {
        await tryDeleteUserMessagesHard(ctx, ctx.chat!.id, [msg.message_id]);
      } catch {}

      return renderPublishChoice(
        ctx,
        storyId,
        `✅ Время сохранено (МСК): <b>${formatDtMsk(dtUtc)}</b>`
      );
    }

    aggPush(ctx, chunk);
  });
}
