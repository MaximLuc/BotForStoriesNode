import mongoose, { Schema } from "mongoose";

export type DraftEnding = {
  title?: string;
  text?: string;
  minRank?: number;
};

const DraftEndingSchema = new Schema<DraftEnding>(
  {
    title: { type: String },
    text: { type: String },
    minRank: { type: Number, min: 0, max: 3, default: 0 },
  },
  { _id: false }
);

const DraftStorySchema = new Schema(
  {
    tgId: { type: Number, required: true }, 
    title: { type: String },
    intro: { type: String },
    endings: { type: [DraftEndingSchema], default: [] },
    minRank: { type: Number, min: 0, max: 3, default: 0 },
    pendingInput: { type: Object, default: null },
  },
  { timestamps: true }
);

DraftStorySchema.index({ tgId: 1 }, { unique: true });

export type DraftStoryDoc = mongoose.InferSchemaType<typeof DraftStorySchema> & { _id: any };

export const DraftStory =
  mongoose.models.DraftStory || mongoose.model("DraftStory", DraftStorySchema);
