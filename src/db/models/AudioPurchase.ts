import { Schema, model, type InferSchemaType } from "mongoose";

const AudioPurchaseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tgId: { type: Number, index: true },
    audioStoryId: { type: Schema.Types.ObjectId, ref: "AudioStory", required: true, index: true },
    paidTokens: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

AudioPurchaseSchema.index({ userId: 1, audioStoryId: 1 }, { unique: true });

export type IAudioPurchase = InferSchemaType<typeof AudioPurchaseSchema>;
export const AudioPurchase = model("AudioPurchase", AudioPurchaseSchema);
