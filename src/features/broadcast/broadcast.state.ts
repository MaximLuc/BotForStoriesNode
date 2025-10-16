export type DraftType = "bulk" | "ad"
export type DraftAudience = "all" | "premium" | "active30"

export type BroadcastDraft = {
  text?: string
  type: DraftType
  audience: DraftAudience
  ttlSec: number
}

const TTL_MS = 10 * 60_000
const drafts = new Map<number, { at: number; data: BroadcastDraft }>()

export function startDraft(tgId: number) {
  drafts.set(tgId, { at: Date.now(), data: { type: "bulk", audience: "all", ttlSec: 5*60 } })
}
export function getDraft(tgId: number): BroadcastDraft | null {
  const e = drafts.get(tgId)
  if (!e) return null
  if (Date.now() - e.at > TTL_MS) { drafts.delete(tgId); return null }
  return e.data
}
export function setDraftText(tgId: number, text: string) { const d = getDraft(tgId); if (d) d.text = text }
export function setDraftType(tgId: number, t: DraftType) { const d = getDraft(tgId); if (d) { d.type = t; d.ttlSec = t==="bulk"?5*60:6*60*60 } }
export function setDraftAudience(tgId: number, a: DraftAudience) { const d = getDraft(tgId); if (d) d.audience = a }
export function setDraftTtl(tgId: number, ttl: number) { const d = getDraft(tgId); if (d) d.ttlSec = ttl }
export function clearDraft(tgId: number) { drafts.delete(tgId) }
const uiMsgByAdmin = new Map<number, number>()

export function setDraftUiMessageId(tgId: number, messageId: number) {
  uiMsgByAdmin.set(tgId, messageId)
}
export function getDraftUiMessageId(tgId: number): number | undefined {
  return uiMsgByAdmin.get(tgId)
}
export function clearDraftUiMessageId(tgId: number) {
  uiMsgByAdmin.delete(tgId)
}