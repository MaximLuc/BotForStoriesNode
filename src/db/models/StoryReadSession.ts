import mongoose from 'mongoose'

const StoryReadSessionSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  tgId:     { type: Number, index: true },                     
  storyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Story', index: true, required: true },

  startedAt:  { type: Date, default: () => new Date(), index: true },
  finishedAt: { type: Date },                                  

  completed:  { type: Boolean, default: false },               
  endingId:   { type: mongoose.Schema.Types.ObjectId },        
  pagesSeen:  { type: Number, default: 0 },                    
  rereadIndex:{ type: Number, default: 0 },                    
  isPremiumUser: { type: Boolean, default: false },

  lastEventAt: { type: Date, default: () => new Date(), index: true },
}, { timestamps: true })

StoryReadSessionSchema.index({ userId: 1, storyId: 1, startedAt: -1 })

export type StoryReadSessionDoc = mongoose.InferSchemaType<typeof StoryReadSessionSchema>
export const StoryReadSession =
  mongoose.models.StoryReadSession || mongoose.model('StoryReadSession', StoryReadSessionSchema)
