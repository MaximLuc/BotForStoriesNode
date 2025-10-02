type PendingCover = { storyId: string; updatedAt: number }

const pendingByUser = new Map<number, PendingCover>()
const TTL_MS = 10 * 60_000
let lastSweep = Date.now()

export function setPendingCover(tgId: number, storyId: string) {
  pendingByUser.set(tgId, { storyId, updatedAt: Date.now() })
}

export function getPendingCover(tgId: number): string | undefined {
  const e = pendingByUser.get(tgId)
  if (!e) return undefined
  e.updatedAt = Date.now()
  return e.storyId
}

export function clearPendingCover(tgId: number) {
  pendingByUser.delete(tgId)
}

export function sweepPendingCovers() {
  const now = Date.now()
  if (now - lastSweep < 60_000) return
  for (const [id, e] of pendingByUser) {
    if (now - e.updatedAt > TTL_MS) pendingByUser.delete(id)
  }
  lastSweep = now
}