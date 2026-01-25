import mongoose from "mongoose";

const UserStoryAccessSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    storyId: { type: mongoose.Schema.Types.ObjectId, ref: "Story", index: true, required: true },
    tgId: { type: Number, index: true },

    paidTokens: { type: Number, required: true },
    unlockedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

UserStoryAccessSchema.index({ userId: 1, storyId: 1 }, { unique: true });

export type UserStoryAccessDoc = mongoose.InferSchemaType<typeof UserStoryAccessSchema>;
export const UserStoryAccess =
  mongoose.models.UserStoryAccess || mongoose.model("UserStoryAccess", UserStoryAccessSchema);
