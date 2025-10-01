// src/db/models/Story.ts
import mongoose, { Schema } from 'mongoose'

const EndingSchema = new Schema({
  title: { type: String, required: true },      // 🔹 добавили
  text:  { type: String, required: true },
  votes: { type: Number, default: 0 },
  minRank: { type: Number, min: 0, max: 3, default: 0 }, // 🔹 задел (настроим отдельным меню позже)
}, { _id: true })

const StorySchema = new Schema({
  title: { type: String, required: true },
  text:  { type: String, required: true },
  coverUrl: { type: String },

  endings: { type: [EndingSchema], default: [] },

  isPublished: { type: Boolean, default: true, index: true },
  minRank: { type: Number, min: 0, max: 3, default: 0, index: true }, // 0=всем, 1=премиум

  stats: {
    views: { type: Number, default: 0 },
    endingsChosen: { type: Number, default: 0 },
  },
}, { timestamps: true })

StorySchema.index({ title: 'text' })
StorySchema.index({ isPublished: 1, createdAt: -1 })
StorySchema.index({ minRank: 1 })

export type StoryDoc = mongoose.InferSchemaType<typeof StorySchema>
export const Story = mongoose.models.Story || mongoose.model('Story', StorySchema)
