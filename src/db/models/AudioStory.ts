import { Schema, model, type InferSchemaType } from "mongoose";

const AudioStorySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    audioId: { type: String, required: true },
    priceTokens: { type: Number, required: true, default: 0, min: 0 },

    durationSec: { type: Number, required: true, default: 0, min: 0 },

    opensCount: { type: Number, required: true, default: 0, min: 0 },
    closesCount: { type: Number, required: true, default: 0, min: 0 },
    tokensSpent: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

export type IAudioStory = InferSchemaType<typeof AudioStorySchema>;
export const AudioStory = model("AudioStory", AudioStorySchema);
