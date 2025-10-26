export function logError(scope: string, error: any, extra?: Record<string, any>) {
  const msg = (error && (error as any).message) || String(error);
  const stack = (error && (error as any).stack) || undefined;
  const payload = { scope, msg, ...(extra || {}) };
  try {
    console.error(`[${new Date().toISOString()}]`, payload);
    if (stack) console.error(stack);
  } catch {
    console.error('logError-fallback', scope, msg);
  }
}

export function logWarn(scope: string, message: string, extra?: Record<string, any>) {
  try {
    console.warn(`[${new Date().toISOString()}]`, { scope, message, ...(extra || {}) });
  } catch {}
}

export function logInfo(scope: string, message: string, extra?: Record<string, any>) {
  try {
    console.log(`[${new Date().toISOString()}]`, { scope, message, ...(extra || {}) });
  } catch {}
}

// Known, expected Telegram API errors that are handled by fallback logic
export function isBenignTelegramError(e: any): boolean {
  const d: string = (e && (e as any).response && (e as any).response.description) || (e && (e as any).message) || "";
  const s = d.toLowerCase();
  return (
    s.includes("message can't be deleted for everyone") ||
    s.includes("message to delete not found") ||
    s.includes("message to edit not found") ||
    s.includes("there is no text in the message to edit") ||
    s.includes("message is not modified")
  );
}

export function logTelegramError(scope: string, error: any, extra?: Record<string, any>) {
  if (isBenignTelegramError(error)) return; // suppress noisy-but-expected errors
  logError(scope, error, extra);
}
