import mongoose, { Types } from "mongoose"

export interface IUserEndingChoice {
  _id: Types.ObjectId
  userId: Types.ObjectId
  tgId?: number
  storyId: Types.ObjectId
  chosenEndingId?: Types.ObjectId | null
  extraEndingIds: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const UserEndingChoiceSchema = new mongoose.Schema<IUserEndingChoice>({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
  tgId:     { type: Number, index: true },
  storyId:  { type: mongoose.Schema.Types.ObjectId, ref: "Story", index: true, required: true },
  chosenEndingId: { type: mongoose.Schema.Types.ObjectId, default: null },
  extraEndingIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
}, { timestamps: true })

UserEndingChoiceSchema.index({ userId: 1, storyId: 1 }, { unique: true })

export type UserEndingChoiceDoc = mongoose.HydratedDocument<IUserEndingChoice>
export const UserEndingChoice =
  mongoose.models.UserEndingChoice as mongoose.Model<IUserEndingChoice> ||
  mongoose.model<IUserEndingChoice>("UserEndingChoice", UserEndingChoiceSchema)
