import type { Telegraf } from "telegraf"
import type { MyContext } from "../../shared/types"
import { Markup } from "telegraf"
import { bufferToText, parseStoryFromText } from "./docText"
import {
  getOrCreateDraft,
  setField,
  setEndingTitle,
  setEndingText,
  resetPending,
} from "./draft.service"
import { renderAddStoryTextScreen } from "../../app/ui/screens.addStoryText"
import { isAdmin } from "../../shared/utils"
import {
  getPendingImport,
  setPendingImport,
  clearPendingImport,
} from "./import.state"
import { getLastMessageId } from "../../app/middlewares/singleMessage"

function html(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}


async function updateMenu(ctx: MyContext, text: string, inline?: any) {
  const kb = inline ? (inline.reply_markup ? inline : { reply_markup: inline }) : undefined


  if (ctx.callbackQuery && "message" in ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", ...kb })
      return
    } catch { }
  }


  const chatId = ctx.chat?.id
  if (chatId) {
    const lastId = getLastMessageId(chatId)
    if (lastId) {
      try {
        await ctx.telegram.editMessageText(chatId, lastId, undefined, text, {
          parse_mode: "HTML",
          ...kb,
        })
        return
      } catch {}
    }
  }

  const sent = await ctx.reply(text, { parse_mode: "HTML", ...kb })
  ;(ctx.state as any)?.rememberMessageId?.(sent.message_id)
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
<code>НАЗВАНИЕ:</code>, <code>НАЧАЛО:</code>, <code>ПРОДОЛЖЕНИЕ1_НАЗВАНИЕ:</code>, <code>ПРОДОЛЖЕНИЕ1_ТЕКСТ:</code>).`

export function registerFileImportActions(bot: Telegraf<MyContext>) {
  bot.action("admin:import_file", async (ctx) => {
    if (!ctx.state.user || !isAdmin(ctx.state.user)) {
      await ctx.answerCbQuery()
      return updateMenu(
        ctx,
        "Доступ только для админа.",
        Markup.inlineKeyboard([[Markup.button.callback("↩︎ Назад", "main")]])
      )
    }
    await ctx.answerCbQuery()
    setPendingImport(ctx.state.user.tgId)
    await resetPending(ctx.state.user.tgId)

    return updateMenu(
      ctx,
      `📨 Загрузка файла для импорта\n\n${HELP()}`,
      Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню", "admin")]])
    )
  })

  bot.on("document", async (ctx, next) => {
    const u = ctx.state.user
    if (!u || !isAdmin(u)) return next()
    if (!getPendingImport(u.tgId)) return next()

    const msg: any = ctx.message
    const doc: any = msg?.document
    if (!doc) return next()

    const mime = String(doc.mime_type || "")
    const fileId = String(doc.file_id)
    const fileName = String(doc.file_name || "")
    const lower = fileName.toLowerCase()

    const isDocx = mime.includes("wordprocessingml.document") || lower.endsWith(".docx")
    const isRtf  = mime.includes("rtf") || lower.endsWith(".rtf")
    const isTxt  = mime.startsWith("text/") || lower.endsWith(".txt")

    const chatId = ctx.chat?.id
    const msgId = msg?.message_id
    const safeDeleteUserMessage = async () => {
      if (!chatId || !msgId) return
      try { await ctx.telegram.deleteMessage(chatId, msgId) } catch {}
    }

    if (!(isDocx || isRtf || isTxt)) {
      await safeDeleteUserMessage()
      return updateMenu(
        ctx,
        `❌ Неподдерживаемый формат: <code>${html(mime || fileName)}</code>\n\n${HELP()}`,
        Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню", "admin")]])
      )
    }

    try {
      const link = await ctx.telegram.getFileLink(fileId)
      const res = await fetch(link.href)
      const buf = Buffer.from(await res.arrayBuffer())

      const plain = await bufferToText(buf, mime, fileName)
      const parsed = parseStoryFromText(plain)

      if (!parsed.title || !parsed.intro) {
        await safeDeleteUserMessage()
        return updateMenu(
          ctx,
          `❌ В файле не найдены обязательные секции <code>TITLE</code> и/или <code>INTRO</code>.\n\n${HELP()}`,
          Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню", "admin")]])
        )
      }

      const d = await getOrCreateDraft(u.tgId)
      await setField(u.tgId, "title", parsed.title.trim())
      await setField(u.tgId, "intro", parsed.intro.trim())

      d.endings.splice(0, d.endings.length)
      const ends = (parsed.endings || []).slice(0, 3)
      for (let i = 0; i < ends.length; i++) {
        if (ends[i].title) await setEndingTitle(u.tgId, i, ends[i].title!)
        if (ends[i].text)  await setEndingText(u.tgId, i, ends[i].text!)
      }

      clearPendingImport(u.tgId)
      await safeDeleteUserMessage()

      const payload = await renderAddStoryTextScreen(ctx)
      return updateMenu(
        ctx,
        `✅ Файл успешно распознан и загружен в черновик.\n\n${payload.text}`,
        payload.inline
      )
    } catch (e) {
      console.error("[import_file] error", e)
      await safeDeleteUserMessage()
      return updateMenu(
        ctx,
        `❌ Ошибка обработки файла. Проверьте паттерн и попробуйте снова.\n\n${HELP()}`,
        Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню", "admin")]])
      )
    }
  })
}
