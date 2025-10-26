import type { Telegraf } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import { Markup } from "telegraf";
import { bufferToText, parseStoryFromText } from "./docText.js";
import {
  getOrCreateDraft,
  setField,
  setEndingTitle,
  setEndingText,
  resetPending,
} from "./draft.service.js";
import { renderAddStoryTextScreen } from "../../app/ui/screens.addStoryText.js";
import { isAdmin } from "../../shared/utils.js";
import {
  getPendingImport,
  setPendingImport,
  clearPendingImport,
} from "./import.state.js";
import { getLastMessageId } from "../../app/middlewares/singleMessage.js";
import { logTelegramError } from "../../shared/logger.js";
import { safeEdit } from "../../app/ui/respond.js";
import { logError } from "../../shared/logger.js";

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function updateMenu(ctx: MyContext, text: string, inline?: any) {
  try { await safeEdit(ctx, text, inline, "HTML") } catch (e) { logTelegramError("fileImport.updateMenu.safeEdit", e) }
}

const HELP = () => `Пришлите файл в одном из форматов: <b>DOCX / RTF / TXT</b>.

<b>Паттерн содержимого:</b>
<pre><code>TITLE: Мой заголовок
INTRO:
Текст начала истории...

ENDING1_TITLE: Название первого продолжения
ENDING1_TEXT:
Текст первого продолжения...

ENDING2_TITLE: ...
ENDING2_TEXT:
...

ENDING3_TITLE: ...
ENDING3_TEXT:
...</code></pre>

Можно указать 1–3 продолжения. Регистр и русские теги тоже принимаются (например:
<code>НАЗВАНИЕ:</code>, <code>НАЧАЛО:</code>, <code>ПРОДОЛЖЕНИЕ1_НАЗВАНИЕ:</code>, <code>ПРОДОЛЖЕНИЕ1_ТЕКСТ:</code>).`;

export function registerFileImportActions(bot: Telegraf<MyContext>) {
  bot.action("admin:import_file", async (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) {
      await ctx.answerCbQuery();
      return updateMenu(
        ctx,
        "Доступ только для админа.",
        Markup.inlineKeyboard([[Markup.button.callback("↩︎ Назад", "main")]])
      );
    }
    await ctx.answerCbQuery();
    setPendingImport(ctx.state.user.tgId);
    await resetPending(ctx.state.user.tgId);

    return updateMenu(
      ctx,
      `📨 Загрузка файла для импорта\n\n${HELP()}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("↩︎ В админ-меню", "admin")],
      ])
    );
  });

  bot.on("document", async (ctx, next) => {
    const u = ctx.state.user;
    if (!u || !isAdmin(u)) return next();
    if (!getPendingImport(u.tgId)) return next();

    const msg: any = ctx.message;
    const doc: any = msg?.document;
    if (!doc) return next();

    const mime = String(doc.mime_type || "");
    const fileId = String(doc.file_id);
    const fileName = String(doc.file_name || "");
    const lower = fileName.toLowerCase();

    const isDocx =
      mime.includes("wordprocessingml.document") || lower.endsWith(".docx");
    const isRtf = mime.includes("rtf") || lower.endsWith(".rtf");
    const isTxt = mime.startsWith("text/") || lower.endsWith(".txt");

    const chatId = ctx.chat?.id;
    const msgId = msg?.message_id;
    const safeDeleteUserMessage = async () => {
      if (!chatId || !msgId) return;
      try {
        await ctx.telegram.deleteMessage(chatId, msgId);
      } catch (e) { logTelegramError("fileImport.deleteUserMessage", e, { chatId, msgId }) }
    };

    if (!(isDocx || isRtf || isTxt)) {
      await safeDeleteUserMessage();
      return updateMenu(
        ctx,
        `❌ Неподдерживаемый формат: <code>${html(
          mime || fileName
        )}</code>\n\n${HELP()}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ В админ-меню", "admin")],
        ])
      );
    }

    try {
      const link = await ctx.telegram.getFileLink(fileId);
      const res = await fetch(link.href);
      const buf = Buffer.from(await res.arrayBuffer());

      const plain = await bufferToText(buf, mime, fileName);
      const parsed = parseStoryFromText(plain);

      if (!parsed.title || !parsed.intro) {
        await safeDeleteUserMessage();
        return updateMenu(
          ctx,
          `❌ В файле не найдены обязательные секции <code>TITLE</code> и/или <code>INTRO</code>.\n\n${HELP()}`,
          Markup.inlineKeyboard([
            [Markup.button.callback("↩︎ В админ-меню", "admin")],
          ])
        );
      }

      const d = await getOrCreateDraft(u.tgId);
      await setField(u.tgId, "title", parsed.title.trim());
      await setField(u.tgId, "intro", parsed.intro.trim());

      d.endings.splice(0, d.endings.length);
      const ends = (parsed.endings || []).slice(0, 3);
      for (let i = 0; i < ends.length; i++) {
        if (ends[i].title) await setEndingTitle(u.tgId, i, ends[i].title!);
        if (ends[i].text) await setEndingText(u.tgId, i, ends[i].text!);
      }

      clearPendingImport(u.tgId);
      await safeDeleteUserMessage();

      const payload = await renderAddStoryTextScreen(ctx);
      return updateMenu(
        ctx,
        `✅ Файл успешно распознан и загружен в черновик.\n\n${payload.text}`,
        payload.inline
      );
    } catch (e) {
      logError("fileImport.processDocument", e, { fileId, fileName, mime })
      await safeDeleteUserMessage();
      return updateMenu(
        ctx,
        `❌ Ошибка обработки файла. Проверьте паттерн и попробуйте снова.\n\n${HELP()}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("↩︎ В админ-меню", "admin")],
        ])
      );
    }
  });
}
