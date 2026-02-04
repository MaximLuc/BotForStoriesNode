import { Schema, model, type InferSchemaType } from "mongoose";

const AudioDraftStorySchema = new Schema(
  {
    tgId: { type: Number, required: true, unique: true },

    title: { type: String, default: "" },
    priceTokens: { type: Number, default: 0 },
    audioId: { type: String, default: "" },

    durationSec: { type: Number, default: 0 },

    pendingInput: { type: String, default: "" },
  },
  { timestamps: true }
);

export type IAudioDraftStory = InferSchemaType<typeof AudioDraftStorySchema>;
export const AudioDraftStory = model("AudioDraftStory", AudioDraftStorySchema);
