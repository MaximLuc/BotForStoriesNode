import mongoose, { Schema } from 'mongoose'

export type DraftEnding = {
  title?: string
  text?: string
}

const DraftEndingSchema = new Schema<DraftEnding>({
  title: { type: String },
  text:  { type: String },
}, { _id: false })

const DraftStorySchema = new Schema({
  tgId: { type: Number, required: true, index: true },
  title: { type: String },
  intro: { type: String },
  endings: { type: [DraftEndingSchema], default: [] },
  minRank: { type: Number, min: 0, max: 3, default: 0 },
  pendingInput: { type: Object, default: null },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true })

export type DraftStoryDoc = mongoose.InferSchemaType<typeof DraftStorySchema> & { _id: any }
export const DraftStory =
  mongoose.models.DraftStory || mongoose.model('DraftStory', DraftStorySchema)
