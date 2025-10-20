import { Types } from "mongoose";
import type { PipelineStage } from "mongoose";
import { Story, type StoryDoc } from "../../db/models/Story.js";
import { StoryReadSession } from "../../db/models/StoryReadSession.js";

export type GlobalStats = {
  storiesTotal: number;
  publishedStories: number;
  totalViews: number;
  totalStarted: number;
  totalCompleted: number;
  totalDrops: number;
  avgReadTimeMs: number;
  uniqueReadersApprox: number;
};

export type StoryCard = {
  storyId: string;
  title: string;
  views: number;
  started: number;
  completed: number;
  drop: number;
  avgReadTimeMs: number;
  conversionStartedPct: number;
  conversionCompletedPct: number;
};

export type RecentTrendBucket = {
  date: string;
  started: number;
  completed: number;
  drops: number;
};

export async function getGlobalStoryStats(): Promise<GlobalStats> {
  const stories = await Story.find(
    {},
    {
      stats: 1,
      isPublished: 1,
    }
  ).lean<Pick<StoryDoc, "stats" | "isPublished">[]>();

  let totalViews = 0;
  let totalStarted = 0;
  let totalCompleted = 0;
  let totalDrops = 0;
  let avgReadTimeMsSum = 0;
  let avgReadTimeMsCount = 0;
  let publishedStories = 0;

  for (const s of stories) {
    const st = s.stats || ({} as any);
    totalViews += st.views || 0;
    totalStarted += st.startedCount || 0;
    totalCompleted += st.completedCount || 0;
    totalDrops += st.dropCount || 0;
    if (typeof st.avgReadTimeMs === "number" && st.avgReadTimeMs > 0) {
      avgReadTimeMsSum += st.avgReadTimeMs;
      avgReadTimeMsCount += 1;
    }
    if (s.isPublished) publishedStories++;
  }

  const uniqueReadersApprox = stories.reduce(
    (acc, s: any) => acc + (s.stats?.uniqueReaders || 0),
    0
  );

  return {
    storiesTotal: stories.length,
    publishedStories,
    totalViews,
    totalStarted,
    totalCompleted,
    totalDrops,
    avgReadTimeMs: avgReadTimeMsCount
      ? Math.round(avgReadTimeMsSum / avgReadTimeMsCount)
      : 0,
    uniqueReadersApprox,
  };
}

export async function getTopStories(limit = 5): Promise<StoryCard[]> {
  const stories = await Story.find(
    {},
    {
      title: 1,
      stats: 1,
    }
  )
    .sort({ "stats.views": -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return stories.map((s) => {
    const st: any = s.stats || {};
    const started = st.startedCount || 0;
    const completed = st.completedCount || 0;
    const views = st.views || 0;
    const drop = st.dropCount || 0;
    const convStartedPct = views > 0 ? (started / views) * 100 : 0;
    const convCompletedPct = started > 0 ? (completed / started) * 100 : 0;

    return {
      storyId: String((s as any)._id),
      title: s.title || "(без названия)",
      views,
      started,
      completed,
      drop,
      avgReadTimeMs: st.avgReadTimeMs || 0,
      conversionStartedPct: convStartedPct,
      conversionCompletedPct: convCompletedPct,
    };
  });
}

export async function getRecentTrend(days = 7) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const pipeline: PipelineStage[] = [
    { $match: { startedAt: { $gte: since } } },
    {
      $project: {
        day: { $dateToString: { format: "%Y-%m-%d", date: "$startedAt" } },
        completed: { $cond: [{ $eq: ["$completed", true] }, 1, 0] },
        dropped: {
          $cond: [
            {
              $and: [{ $ne: ["$completed", true] }, { $gt: ["$pagesSeen", 0] }],
            },
            1,
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: "$day",
        started: { $sum: 1 },
        completed: { $sum: "$completed" },
        drops: { $sum: "$dropped" },
      },
    },
    { $sort: { _id: 1 as 1 } },
  ];

  const rows = await StoryReadSession.aggregate(pipeline).exec();

  const map = new Map<
    string,
    { started: number; completed: number; drops: number }
  >();
  for (const r of rows as Array<{
    _id: string;
    started: number;
    completed: number;
    drops: number;
  }>) {
    map.set(r._id, {
      started: r.started,
      completed: r.completed,
      drops: r.drops,
    });
  }

  const out: {
    date: string;
    started: number;
    completed: number;
    drops: number;
  }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const v = map.get(key) || { started: 0, completed: 0, drops: 0 };
    out.push({ date: key, ...v });
  }
  return out;
}
