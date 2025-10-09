const pendingByUser = new Map<number, { startedAt: number }>()
const TTL_MS = 10 * 60_000

export function setPendingImport(tgId: number) {
  pendingByUser.set(tgId, { startedAt: Date.now() })
}

export function clearPendingImport(tgId?: number) {
  if (!tgId) return
  pendingByUser.delete(tgId)
}

export function getPendingImport(tgId?: number): boolean {
  if (!tgId) return false
  const e = pendingByUser.get(tgId)
  if (!e) return false
  if (Date.now() - e.startedAt > TTL_MS) {
    pendingByUser.delete(tgId)
    return false
  }
  return true
}

export function sweepPendingImports() {
  const now = Date.now()
  for (const [uid, e] of pendingByUser.entries()) {
    if (now - e.startedAt > TTL_MS) pendingByUser.delete(uid)
  }
}
