import type { PipelineStage } from "mongoose";
import { AudioStory } from "../../db/models/AudioStory.js";
import { AudioPurchase } from "../../db/models/AudioPurchase.js";

export type GlobalAudioStats = {
  storiesTotal: number;
  totalOpens: number;
  totalCloses: number;
  closeRatePct: number; 
  totalTokensSpent: number;
  totalPurchases: number;
  avgPriceTokens: number;
  totalDurationSec: number;
};

export type AudioCard = {
  audioStoryId: string;
  title: string;
  priceTokens: number;
  durationSec: number;
  opensCount: number;
  closesCount: number;
  tokensSpent: number;
  closeRatePct: number;
};

export type RecentAudioTrendBucket = {
  date: string; 
  purchases: number;
  tokensSpent: number;
  newStories: number;
};

function safeInt(n: any) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? Math.floor(x) : 0;
}

export async function getGlobalAudioStats(): Promise<GlobalAudioStats> {
  const stories = await AudioStory.find(
    {},
    {
      opensCount: 1,
      closesCount: 1,
      tokensSpent: 1,
      priceTokens: 1,
      durationSec: 1,
    }
  ).lean<any[]>();

  const storiesTotal = stories.length;

  let totalOpens = 0;
  let totalCloses = 0;
  let totalTokensSpent = 0;
  let totalDurationSec = 0;

  let priceSum = 0;
  let priceCount = 0;

  for (const s of stories) {
    totalOpens += safeInt(s.opensCount);
    totalCloses += safeInt(s.closesCount);
    totalTokensSpent += safeInt(s.tokensSpent);
    totalDurationSec += safeInt(s.durationSec);

    const p = safeInt(s.priceTokens);
    if (p > 0) {
      priceSum += p;
      priceCount += 1;
    }
  }

  const totalPurchases = await AudioPurchase.countDocuments({}).exec();

  const closeRatePct = totalOpens > 0 ? (totalCloses / totalOpens) * 100 : 0;
  const avgPriceTokens = priceCount > 0 ? Math.round(priceSum / priceCount) : 0;

  return {
    storiesTotal,
    totalOpens,
    totalCloses,
    closeRatePct,
    totalTokensSpent,
    totalPurchases,
    avgPriceTokens,
    totalDurationSec,
  };
}

export async function getTopAudioByOpens(limit = 5): Promise<AudioCard[]> {
  const docs = await AudioStory.find(
    {},
    {
      title: 1,
      priceTokens: 1,
      durationSec: 1,
      opensCount: 1,
      closesCount: 1,
      tokensSpent: 1,
    }
  )
    .sort({ opensCount: -1, createdAt: -1 })
    .limit(limit)
    .lean<any[]>();

  return docs.map((s) => {
    const opens = safeInt(s.opensCount);
    const closes = safeInt(s.closesCount);
    const closeRatePct = opens > 0 ? (closes / opens) * 100 : 0;

    return {
      audioStoryId: String(s._id),
      title: s.title || "(без названия)",
      priceTokens: safeInt(s.priceTokens),
      durationSec: safeInt(s.durationSec),
      opensCount: opens,
      closesCount: closes,
      tokensSpent: safeInt(s.tokensSpent),
      closeRatePct,
    };
  });
}

export async function getTopAudioByTokensSpent(limit = 5): Promise<AudioCard[]> {
  const docs = await AudioStory.find(
    {},
    {
      title: 1,
      priceTokens: 1,
      durationSec: 1,
      opensCount: 1,
      closesCount: 1,
      tokensSpent: 1,
    }
  )
    .sort({ tokensSpent: -1, createdAt: -1 })
    .limit(limit)
    .lean<any[]>();

  return docs.map((s) => {
    const opens = safeInt(s.opensCount);
    const closes = safeInt(s.closesCount);
    const closeRatePct = opens > 0 ? (closes / opens) * 100 : 0;

    return {
      audioStoryId: String(s._id),
      title: s.title || "(без названия)",
      priceTokens: safeInt(s.priceTokens),
      durationSec: safeInt(s.durationSec),
      opensCount: opens,
      closesCount: closes,
      tokensSpent: safeInt(s.tokensSpent),
      closeRatePct,
    };
  });
}

export async function getNewestAudioStories(limit = 5) {
  const docs = await AudioStory.find(
    {},
    { title: 1, durationSec: 1, priceTokens: 1, createdAt: 1 }
  )
    .sort({ createdAt: -1 })
    .limit(Math.max(1, limit))
    .lean<any[]>();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = docs.filter((d) => d.createdAt && new Date(d.createdAt) >= since);

  const out = recent.length ? recent : docs;

  return out.map((d) => ({
    audioStoryId: String(d._id),
    title: d.title || "(без названия)",
    durationSec: safeInt(d.durationSec),
    priceTokens: safeInt(d.priceTokens),
  }));
}

export async function getRecentAudioTrend(days = 7): Promise<RecentAudioTrendBucket[]> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const purchasePipeline: PipelineStage[] = [
    { $match: { paidAt: { $gte: since } } },
    {
      $project: {
        day: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
        paidTokens: { $ifNull: ["$paidTokens", 0] },
      },
    },
    {
      $group: {
        _id: "$day",
        purchases: { $sum: 1 },
        tokensSpent: { $sum: "$paidTokens" },
      },
    },
    { $sort: { _id: 1 as 1 } },
  ];

  const purchaseRows = await AudioPurchase.aggregate(purchasePipeline).exec();

  const storyPipeline: PipelineStage[] = [
    { $match: { createdAt: { $gte: since } } },
    {
      $project: {
        day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
      },
    },
    { $group: { _id: "$day", newStories: { $sum: 1 } } },
    { $sort: { _id: 1 as 1 } },
  ];

  const storyRows = await AudioStory.aggregate(storyPipeline).exec();

  const pMap = new Map<string, { purchases: number; tokensSpent: number }>();
  for (const r of purchaseRows as any[]) {
    pMap.set(String(r._id), {
      purchases: safeInt(r.purchases),
      tokensSpent: safeInt(r.tokensSpent),
    });
  }

  const sMap = new Map<string, number>();
  for (const r of storyRows as any[]) {
    sMap.set(String(r._id), safeInt(r.newStories));
  }

  const out: RecentAudioTrendBucket[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);

    const pv = pMap.get(key) || { purchases: 0, tokensSpent: 0 };
    const nv = sMap.get(key) ?? 0;

    out.push({
      date: key,
      purchases: pv.purchases,
      tokensSpent: pv.tokensSpent,
      newStories: nv,
    });
  }

  return out;
}
