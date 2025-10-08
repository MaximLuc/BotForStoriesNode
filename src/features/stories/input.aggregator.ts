import type { MyContext } from '../../shared/types'

type Bucket = {
  chatId: number
  parts: string[]
  msgIds: number[]
  kind: string 
  createdAt: number
}

const buckets = new Map<number, Bucket>()

export function aggStart(tgId: number, chatId: number, kind: string) {
  buckets.set(tgId, { chatId, parts: [], msgIds: [], kind, createdAt: Date.now() })
}

export function aggPush(ctx: MyContext, text: string) {
  const tgId = ctx.state.user!.tgId
  const chatId = ctx.chat!.id
  const msgId = (ctx.message as any)?.message_id as number | undefined
  let b = buckets.get(tgId)
  if (!b) {
    b = { chatId, parts: [], msgIds: [], kind: 'unknown', createdAt: Date.now() }
    buckets.set(tgId, b)
  }
  b.chatId = chatId
  b.parts.push(text)
  if (msgId) b.msgIds.push(msgId)
}

export function aggFinalize(tgId: number) {
  const b = buckets.get(tgId)
  if (!b) return null
  const text = b.parts.join('')
  return { chatId: b.chatId, kind: b.kind, text, msgIds: [...b.msgIds] }
}

export function aggReset(tgId: number) {
  buckets.delete(tgId)
}
