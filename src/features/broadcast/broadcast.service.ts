import type { Telegraf } from "telegraf";
import { Markup } from "telegraf";
import { ROLE } from "../../shared/constants.js";
import { User } from "../../db/models/User.js";
import { StoryReadSession } from "../../db/models/StoryReadSession.js";
import { BroadcastMessage } from "../../db/models/BroadcastMessage.js";
import { buildInlineMain } from "../../app/ui/menus.js";
import { getLastMessageId } from "../../app/middlewares/singleMessage.js";

type Audience = "all" | "premium" | "active30";
type BType = "bulk" | "ad";

export type BroadcastReport = { total: number; ok: number; fail: number };

export async function resolveAudience(audience: Audience): Promise<number[]> {
  if (audience === "all") {
    const users = await User.find(
      { role: { $in: [ROLE.USER, ROLE.PREMIUM_USER] } },
      { tgId: 1 }
    ).lean();
    return users.map((u) => u.tgId).filter(Boolean);
  }
  if (audience === "premium") {
    const users = await User.find(
      { role: ROLE.PREMIUM_USER },
      { tgId: 1 }
    ).lean();
    return users.map((u) => u.tgId).filter(Boolean);
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const tgIds = await StoryReadSession.distinct("tgId", {
    lastEventAt: { $gte: since },
  });
  return (tgIds as number[]).filter(Boolean);
}

export async function sendBroadcast(
  telegram: Telegraf["telegram"],
  payload: {
    text: string;
    type: BType;
    audience: Audience;
    ttlSec: number;
    createdByTgId: number;
  }
): Promise<BroadcastReport> {
  const recipients = await resolveAudience(payload.audience);
  const total = recipients.length;

  const deleteAt = new Date(Date.now() + payload.ttlSec * 1000);
  const br = await BroadcastMessage.create({
    text: payload.text,
    type: payload.type,
    audience: payload.audience,
    ttlSec: payload.ttlSec,
    deleteAt,
    status: "queued",
    createdByTgId: payload.createdByTgId,
    stats: { total, ok: 0, fail: 0 },
    deliveries: [],
  });

  let ok = 0;
  let fail = 0;
  const chunk = 20;
  for (let i = 0; i < recipients.length; i += chunk) {
    const slice = recipients.slice(i, i + chunk);
    await Promise.all(
      slice.map(async (chatId) => {
        try {
          let sentId: number | null = null

          if (payload.type === "ad") {
            const lastMenu = getLastMessageId(chatId);
            if (lastMenu) {
              try {
                await telegram.deleteMessage(chatId, lastMenu);
              } catch {}
            }

            await telegram.sendMessage(chatId, payload.text, {
              parse_mode: "HTML",
            });

            const inline = buildInlineMain(undefined);
            await telegram.sendMessage(
              chatId,
              `Добро пожаловать в (название бота)! Вы можете читать истории, выбирать концовки и многое другое 🌸`,
              { reply_markup: inline.reply_markup }
            );
          } else {
            const sent = await telegram.sendMessage(chatId, payload.text, {
              parse_mode: "HTML",
            });
            sentId = sent.message_id;
          }

          ok++;
          await BroadcastMessage.updateOne(
            { _id: br._id },
            {
              $push: { deliveries: { tgId: chatId, messageId: sentId } },
              $inc: { "stats.ok": 1 },
            }
          );
        } catch {
          fail++;
          await BroadcastMessage.updateOne(
            { _id: br._id },
            { $inc: { "stats.fail": 1 } }
          );
        }
      })
    );
    await delay(1200);
  }

  await BroadcastMessage.updateOne(
    { _id: br._id },
    { $set: { status: "sent" } }
  );

  return { total, ok, fail };
}

function ensureMarkup(inline?: ReturnType<typeof Markup.inlineKeyboard>) {
  return inline?.reply_markup ? { reply_markup: inline.reply_markup } : {};
}
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
