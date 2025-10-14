import mongoose from "mongoose";

const RereadsMapSchema = new mongoose.Schema({}, { _id: false, strict: false });

const EndingChoiceMapSchema = new mongoose.Schema(
  {},
  { _id: false, strict: false }
);

const UserStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      index: true,
      required: true,
    },
    tgId: { type: Number, index: true },

    storiesCompletedCount: { type: Number, default: 0 },
    storiesStartedCount: { type: Number, default: 0 },

    endingsChosenCount: { type: Number, default: 0 },
    endingChoices: { type: EndingChoiceMapSchema, default: () => ({}) },

    dropsCount: { type: Number, default: 0 },

    avgReadTimeMs: { type: Number, default: 0 },
    longestStoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Story" },
    longestStoryChars: { type: Number, default: 0 },

    rereads: { type: RereadsMapSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type UserStatsDoc = mongoose.InferSchemaType<typeof UserStatsSchema>;
export const UserStats =
  mongoose.models.UserStats || mongoose.model("UserStats", UserStatsSchema);
