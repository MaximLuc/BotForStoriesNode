import mongoose from "mongoose";

const EndingStatsSchema = new mongoose.Schema(
  {
    chosenCount: { type: Number, default: 0 },
    chosenByFree: { type: Number, default: 0 },
    chosenByPremium: { type: Number, default: 0 },
  },
  { _id: false }
);

const EndingSchema = new mongoose.Schema(
  {
    title: { type: String },
    text: { type: String, required: true },
    votes: { type: Number, default: 0 },
    minRank: { type: Number, min: 0, max: 3, default: 0 },
    stats: { type: EndingStatsSchema, default: () => ({}) },
  },
  { _id: true }
);

const ConversionsSchema = new mongoose.Schema(
  {
    started: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    choseEnd: { type: Number, default: 0 },
  },
  { _id: false }
);

const StoryStatsSchema = new mongoose.Schema(
  {
    views: { type: Number, default: 0 },
    uniqueReaders: { type: Number, default: 0 },
    startedCount: { type: Number, default: 0 },
    completedCount: { type: Number, default: 0 },
    restartsCount: { type: Number, default: 0 },
    dropCount: { type: Number, default: 0 },
    avgReadTimeMs: { type: Number, default: 0 },
    conversions: { type: ConversionsSchema, default: () => ({}) },
  },
  { _id: false }
);

const StorySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    text: { type: String, required: true },
    coverUrl: { type: String },

    endings: { type: [EndingSchema], default: [] },
    entryTokens: { type: Number, default: 0, enum: [0, 1, 3, 5], index: true },

    isPublished: { type: Boolean, default: false, index: true },
    publishAt: { type: Date, default: null, index: true },   
    publishedAt: { type: Date, default: null },              

    minRank: { type: Number, min: 0, max: 3, default: 0, index: true },

    stats: { type: StoryStatsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

StorySchema.index({ title: "text" });
StorySchema.index({ isPublished: 1, createdAt: -1 });
StorySchema.index({ isPublished: 1, publishAt: 1 }); 

export type StoryDoc = mongoose.InferSchemaType<typeof StorySchema>;
export const Story =
  mongoose.models.Story || mongoose.model("Story", StorySchema);
