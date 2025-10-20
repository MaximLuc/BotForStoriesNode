import type { MyContext } from "../../shared/types.js"
import { Markup } from "telegraf"
import { getDraft, setDraftType, setDraftTtl, setDraftText, startDraft, setDraftAudience } from "../../features/broadcast/broadcast.state.js"

function html(s=""){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

export function renderBroadcastPreview(ctx: MyContext) {
  const u = ctx.state.user!
  const d = getDraft(u.tgId)
  const text = d?.text ?? "(текст не задан)"

  const typeRow = [
    Markup.button.callback(d?.type === "bulk" ? "✅ Рассылка":"Рассылка", "broadcast:type:bulk"),
    Markup.button.callback(d?.type === "ad"   ? "✅ Реклама":"Реклама",   "broadcast:type:ad"),
  ]
  const audRow = [
    Markup.button.callback(d?.audience === "all"      ? "✅ Всем"     :"Всем",     "broadcast:aud:all"),
    Markup.button.callback(d?.audience === "premium"  ? "✅ Премиум"  :"Премиум",  "broadcast:aud:premium"),
    Markup.button.callback(d?.audience === "active30" ? "✅ Актив 30" :"Актив 30", "broadcast:aud:active30"),
  ]
  const ttlRow = (d?.type==="bulk")
    ? [
        Markup.button.callback(d?.ttlSec===5*60   ? "✅ 5 мин":"5 мин",   "broadcast:ttl:300"),
        Markup.button.callback(d?.ttlSec===20*60  ? "✅ 20 мин":"20 мин", "broadcast:ttl:1200"),
        Markup.button.callback(d?.ttlSec===60*60  ? "✅ 1 час":"1 час",   "broadcast:ttl:3600"),
      ]
    : [
        Markup.button.callback(d?.ttlSec===6*60*60    ? "✅ 6 часов":"6 часов", "broadcast:ttl:21600"),
        Markup.button.callback(d?.ttlSec===24*60*60   ? "✅ 24 часа":"24 часа", "broadcast:ttl:86400"),
        Markup.button.callback(d?.ttlSec===3*24*60*60 ? "✅ 3 дня":"3 дня",     "broadcast:ttl:259200"),
      ]
  const posHint = d?.type==="ad"
    ? "Реклама будет размещена <b>над</b> меню (меню пересоздадим)."
    : "Сообщение будет <b>под</b> текущим меню."

  return {
    text:
`<b>Предпросмотр</b>

${html(text)}

Тип: <b>${d?.type==="ad"?"Реклама":"Рассылка"}</b>
Аудитория: <b>${d?.audience==="all"?"всем":d?.audience==="premium"?"премиум":"актив 30 дней"}</b>
TTL: <b>${Math.round((d?.ttlSec ?? 0)/60)} мин</b> (${posHint})`,
    inline: Markup.inlineKeyboard([
      typeRow,
      audRow,
      ttlRow,
      [Markup.button.callback("🚀 Отправить", "broadcast:send")],
      [Markup.button.callback("✖️ Отмена", "broadcast:cancel")],
      [Markup.button.callback("↩︎ В админ-меню", "admin")],
    ]),
    parseMode: "HTML" as const,
  }
}

export function onDraftText(ctx: MyContext) {
  const u = ctx.state.user!
  setDraftText(u.tgId, (ctx.message as any).text)
  const chatId = ctx.chat?.id, msgId = (ctx.message as any)?.message_id
  if (chatId && msgId) { ctx.telegram.deleteMessage(chatId, msgId).catch(()=>{}) }
  return renderBroadcastPreview(ctx)
}

export function changeDraft(ctx: MyContext, kind: "type"|"aud"|"ttl", value: string) {
  const u = ctx.state.user!
  if (kind==="type") setDraftType(u.tgId, value as any)
  else if (kind==="aud") setDraftAudience(u.tgId, value as any)
  else setDraftTtl(u.tgId, Number(value))
  return renderBroadcastPreview(ctx)
}

export function startBroadcastDraft(ctx: MyContext) {
  const u = ctx.state.user!
  startDraft(u.tgId)
  return {
    text: "Введите новость или текст рекламы одним сообщением:",
    inline: Markup.inlineKeyboard([[Markup.button.callback("↩︎ В админ-меню","admin")]]),
    parseMode: "HTML" as const,
  }
}
