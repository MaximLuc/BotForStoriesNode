import { Types } from "mongoose";
import type { MyContext } from "../../shared/types.js";
import { Story } from "../../db/models/Story.js";
import { StoryReadSession } from "../../db/models/StoryReadSession.js";
import { UserStats } from "../../db/models/UserStats.js";

const PAGE_LEN = 3600;
function paginate(text: string, limit = PAGE_LEN): string[] {
  const t = (text ?? "").trim();
  if (t.length <= limit) return [t];
  const parts: string[] = [];
  let i = 0;
  while (i < t.length) {
    let end = Math.min(i + limit, t.length);
    if (end < t.length) {
      const slice = t.slice(i, end);
      let cut = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"));
      if (cut < Math.floor(limit * 0.7)) cut = slice.lastIndexOf(" ");
      end = cut > 0 ? i + cut : end;
    }
    parts.push(t.slice(i, end).trim());
    i = end;
  }
  return parts.filter(Boolean);
}

function isPremiumOrAdmin(role?: string) {
  return role === "premium" || role === "admin" || role === "premium_admin";
}

async function getOrCreateUserStats(userId?: Types.ObjectId, tgId?: number) {
  if (!userId) return null;
  const found = await UserStats.findOne({ userId });
  if (found) return found;
  return await UserStats.create({ userId, tgId });
}

async function findActiveSession(
  userId: Types.ObjectId,
  storyId: Types.ObjectId
) {
  return StoryReadSession.findOne({
    userId,
    storyId,
    finishedAt: { $exists: false },
  }).sort({ startedAt: -1 });
}

async function lastCompletedCount(
  userId: Types.ObjectId,
  storyId: Types.ObjectId
) {
  return StoryReadSession.countDocuments({ userId, storyId, completed: true });
}

export async function openOrPage(
  ctx: MyContext,
  storyId: string,
  page: number
) {
  const u = ctx.state.user;
  const mongoUserId = (u as any)?._id as Types.ObjectId | undefined;
  const tgId = u?.tgId;
  const role = (u as any)?.role as string | undefined;
  const isPrem = isPremiumOrAdmin(role);

  const story = await Story.findById(storyId);
  if (!story) return;

  const pages = paginate(story.text || "").length;
  const userId = mongoUserId;
  if (!userId) return;

  let session = await findActiveSession(userId, story._id);

  if (!session) {
    const rereadIndex = await lastCompletedCount(userId, story._id);
    session = await StoryReadSession.create({
      userId,
      tgId,
      storyId: story._id,
      startedAt: new Date(),
      lastEventAt: new Date(),
      pagesSeen: 0,
      rereadIndex,
      isPremiumUser: isPrem,
    });

    await Story.updateOne(
      { _id: story._id },
      {
        $inc: {
          "stats.views": 1,
          "stats.startedCount": 1,
          ...(rereadIndex > 0 ? { "stats.restartsCount": 1 } : {}),
        },
      }
    );

    const anySessionBefore = await StoryReadSession.exists({
      userId,
      storyId: story._id,
    });
    if (!anySessionBefore) {
      await Story.updateOne(
        { _id: story._id },
        { $inc: { "stats.uniqueReaders": 1 } }
      );
    }

    const us = await getOrCreateUserStats(userId, tgId);
    if (us) {
      us.storiesStartedCount = (us.storiesStartedCount ?? 0) + 1;
      await us.save();
    }
  } else {
    await Story.updateOne({ _id: story._id }, { $inc: { "stats.views": 1 } });
  }

  const newPagesSeen = Math.max(session.pagesSeen ?? 0, page + 1);
  if (newPagesSeen !== session.pagesSeen) {
    session.pagesSeen = newPagesSeen;
    session.lastEventAt = new Date();
    await session.save();
  }

  if (page >= pages - 1 && !session.completed) {
    session.completed = true;
    session.lastEventAt = new Date();
    await session.save();
    await Story.updateOne(
      { _id: story._id },
      { $inc: { "stats.completedCount": 1, "stats.conversions.completed": 1 } }
    );
  }
}

export async function chooseEnding(
  ctx: MyContext,
  storyId: string,
  endingIndex: number
) {
  const u = ctx.state.user;
  const mongoUserId = (u as any)?._id as Types.ObjectId | undefined;
  const tgId = u?.tgId;
  const role = (u as any)?.role as string | undefined;
  const isPrem = isPremiumOrAdmin(role);

  const story = await Story.findById(storyId);
  if (!story) return;

  const ending = story.endings?.[endingIndex];
  if (!ending) return;

  if (!mongoUserId) return;
  const session = await findActiveSession(mongoUserId, story._id);
  const now = new Date();

  if (session) {
    session.finishedAt = now;
    session.completed = true;
    session.endingId = ending._id;
    session.lastEventAt = now;
    await session.save();

    const durMs = session.startedAt
      ? now.getTime() - session.startedAt.getTime()
      : 0;

    const s = await Story.findById(story._id);
    if (s) {
      const prevAvg = s.stats?.avgReadTimeMs ?? 0;
      const prevN = s.stats?.conversions?.choseEnd ?? 0;
      const newAvg = Math.round((prevAvg * prevN + durMs) / (prevN + 1));
      await Story.updateOne(
        { _id: story._id, "endings._id": ending._id },
        {
          $set: { "stats.avgReadTimeMs": newAvg },
          $inc: {
            "stats.conversions.choseEnd": 1,
            "endings.$.stats.chosenCount": 1,
            ...(isPrem
              ? { "endings.$.stats.chosenByPremium": 1 }
              : { "endings.$.stats.chosenByFree": 1 }),
          },
        }
      );
    }

    const us = await getOrCreateUserStats(mongoUserId, tgId);
    if (us) {
      const prevAvg = us.avgReadTimeMs ?? 0;
      const prevN = us.storiesCompletedCount ?? 0;
      const newAvg = Math.round((prevAvg * prevN + durMs) / (prevN + 1));

      us.storiesCompletedCount = (us.storiesCompletedCount ?? 0) + 1;
      us.endingsChosenCount = (us.endingsChosenCount ?? 0) + 1;
      us.avgReadTimeMs = newAvg;

      const eId = String(ending._id);
      const map = (us as any).endingChoices ?? {};
      map[eId] = (map[eId] ?? 0) + 1;
      (us as any).endingChoices = map;

      const storyLen = (story.text ?? "").length;
      if ((us.longestStoryChars ?? 0) < storyLen) {
        us.longestStoryChars = storyLen;
        us.longestStoryId = story._id;
      }

      if ((session?.rereadIndex ?? 0) > 0) {
        const rmap = (us as any).rereads ?? {};
        const sid = String(story._id);
        rmap[sid] = (rmap[sid] ?? 0) + 1;
        (us as any).rereads = rmap;
      }

      await us.save();
    }
  }
}

export async function dropActiveSession(ctx: MyContext, storyId: string) {
  const u = ctx.state.user;
  const mongoUserId = (u as any)?._id as Types.ObjectId | undefined;
  if (!mongoUserId) return;
  const session = await findActiveSession(
    mongoUserId,
    new Types.ObjectId(storyId)
  );
  if (!session) return;

  const now = new Date();
  session.finishedAt = now;
  session.completed = !!session.completed;
  session.lastEventAt = now;
  await session.save();

  if (!session.completed) {
    await Story.updateOne({ _id: storyId }, { $inc: { "stats.dropCount": 1 } });
    const us = await getOrCreateUserStats(mongoUserId, u?.tgId);
    if (us) {
      us.dropsCount = (us.dropsCount ?? 0) + 1;
      await us.save();
    }
  }
}
