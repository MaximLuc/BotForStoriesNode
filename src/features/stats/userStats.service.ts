import { Types } from "mongoose";
import { UserStats, type UserStatsDoc } from "../../db/models/UserStats.js";
import { Story } from "../../db/models/Story.js";

type TopEntry = {
  storyId: string;
  title?: string;
  count: number;
  label?: string;
};

export async function getUserStatsByTgId(
  tgId?: number | null
): Promise<UserStatsDoc | null> {
  if (!tgId) return null;
  const doc = await UserStats.findOne({ tgId }).lean<UserStatsDoc>().exec();
  return doc ?? null;
}

export async function getTopRereads(
  stats: UserStatsDoc | null,
  limit = 3
): Promise<TopEntry[]> {
  if (!stats?.rereads || typeof stats.rereads !== "object") return [];

  const rows: TopEntry[] = Object.entries(stats.rereads as Record<string, any>)
    .filter(([_, v]) => typeof v === "number" && v > 0)
    .map(([storyId, count]) => ({ storyId, count: Number(count) }));

  rows.sort((a, b) => b.count - a.count);
  const top = rows.slice(0, limit);

  const ids = top
    .map((x) =>
      Types.ObjectId.isValid(x.storyId) ? new Types.ObjectId(x.storyId) : null
    )
    .filter(Boolean) as Types.ObjectId[];

  if (ids.length) {
    const stories = await Story.find({ _id: { $in: ids } }, { title: 1 })
      .lean()
      .exec();
    const map = new Map(stories.map((s) => [String(s._id), s.title]));
    for (const t of top) {
      if (map.has(t.storyId)) t.title = map.get(t.storyId);
    }
  }
  return top;
}

export async function getTopEndingChoices(
  stats: UserStatsDoc | null,
  limit = 3
): Promise<TopEntry[]> {
  if (!stats?.endingChoices || typeof stats.endingChoices !== "object")
    return [];

  type RawRow = { storyId: string; endingKey?: string; count: number };
  const collected: RawRow[] = [];

  for (const [k, v] of Object.entries(
    stats.endingChoices as Record<string, any>
  )) {
    if (typeof v === "number") {
      const { storyId, endingKey } = splitKey(k);
      collected.push({ storyId, endingKey, count: v });
    } else if (v && typeof v === "object") {
      const storyId = k;
      for (const [endingKey, cnt] of Object.entries(v)) {
        if (typeof cnt === "number") {
          collected.push({ storyId, endingKey, count: cnt });
        }
      }
    }
  }

  collected.sort((a, b) => b.count - a.count);
  const top = collected.slice(0, limit);

  const ids = top
    .map((x) =>
      Types.ObjectId.isValid(x.storyId) ? new Types.ObjectId(x.storyId) : null
    )
    .filter(Boolean) as Types.ObjectId[];

  const result: TopEntry[] = top.map((t) => ({
    storyId: t.storyId,
    count: t.count,
    label: t.endingKey,
  }));

  if (ids.length) {
    const stories = await Story.find({ _id: { $in: ids } }, { title: 1 })
      .lean()
      .exec();
    const map = new Map(stories.map((s) => [String(s._id), s.title]));
    for (const r of result) {
      if (map.has(r.storyId)) r.title = map.get(r.storyId);
    }
  }

  return result;
}

function splitKey(k: string): { storyId: string; endingKey?: string } {
  const m = k.match(/([a-f0-9]{24})(?:[#:|/_-]?(.+))?$/i);
  if (m) {
    return { storyId: m[1], endingKey: m[2] };
  }
  return { storyId: k };
}
