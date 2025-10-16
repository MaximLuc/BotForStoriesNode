import mongoose from "mongoose"

const RequiredChannelSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  title: String,
  username: String,
}, { timestamps: true })

export type RequiredChannelDoc = mongoose.InferSchemaType<typeof RequiredChannelSchema>
export const RequiredChannel =
  mongoose.models.RequiredChannel || mongoose.model("RequiredChannel", RequiredChannelSchema)
