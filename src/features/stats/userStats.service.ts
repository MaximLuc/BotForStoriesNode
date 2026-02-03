import mongoose, { Types } from "mongoose";
import { UserWallet } from "../../db/models/UserWallet.js";
import { UserStoryAccess } from "../../db/models/UserStoryAccess.js";
import { AudioPurchase } from "../../db/models/AudioPurchase.js";
import { StoryReadSession } from "../../db/models/StoryReadSession.js";

type Args = {
  userId: Types.ObjectId;
  tgId?: number;
};

type UserProfileStats = {
  keys: {
    balance: number;
    spentOnStories: number; 
    spentOnAudio: number;   
    spentTotal: number;
  };
  reading: {
    sessionsTotal: number;        
    uniqueStoriesOpened: number;  
    completedSessions: number;    
    droppedSessions: number;      
  };
  endings: {
    purchases: number; 
  };
  audio: {
    purchases: number; 
  };
};

function num(n: any): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

async function sumField(
  collection: "UserStoryAccess" | "AudioPurchase",
  userId: Types.ObjectId,
  field: string
): Promise<number> {
  const Model = collection === "UserStoryAccess" ? UserStoryAccess : AudioPurchase;

  const rows = await Model.aggregate([
    { $match: { userId } },
    { $group: { _id: null, s: { $sum: `$${field}` } } },
  ]).exec();

  return num(rows?.[0]?.s);
}

async function countEndingPurchases(userId: Types.ObjectId): Promise<number> {

  const col = mongoose.connection.collection("userendingchoices");

  const n = await col.countDocuments({ userId } as any);
  return num(n);
}

export async function getUserProfileStats(args: Args): Promise<UserProfileStats> {
  const { userId } = args;

  const w = await UserWallet.findOne({ userId }, { tokens: 1 }).lean().exec();
  const balance = num((w as any)?.tokens);

  const [spentOnStories, spentOnAudio] = await Promise.all([
    sumField("UserStoryAccess", userId, "paidTokens"),
    sumField("AudioPurchase", userId, "paidTokens"),
  ]);

  const [sessionsTotal, uniqueStoryIds, completedSessions, droppedSessions] =
    await Promise.all([
      StoryReadSession.countDocuments({ userId }).exec(),
      StoryReadSession.distinct("storyId", { userId }).exec(),
      StoryReadSession.countDocuments({ userId, completed: true }).exec(),
      StoryReadSession.countDocuments({
        userId,
        completed: false,
        finishedAt: { $exists: true },
      }).exec(),
    ]);

  const endingsPurchases = await countEndingPurchases(userId);

  const audioPurchases = await AudioPurchase.countDocuments({ userId }).exec();

  return {
    keys: {
      balance,
      spentOnStories,
      spentOnAudio,
      spentTotal: spentOnStories + spentOnAudio,
    },
    reading: {
      sessionsTotal: num(sessionsTotal),
      uniqueStoriesOpened: Array.isArray(uniqueStoryIds) ? uniqueStoryIds.length : 0,
      completedSessions: num(completedSessions),
      droppedSessions: num(droppedSessions),
    },
    endings: {
      purchases: endingsPurchases,
    },
    audio: {
      purchases: num(audioPurchases),
    },
  };
}
