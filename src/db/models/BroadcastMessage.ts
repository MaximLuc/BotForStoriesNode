import mongoose from "mongoose"

export type Audience = "all" | "premium" | "active30"
export type BType = "bulk" | "ad"
export type BStatus = "draft" | "queued" | "sent" | "deleted"

const DeliverySchema = new mongoose.Schema({
  tgId: { type: Number, required: true, index: true },
  messageId: { type: Number, required: true },
  deleted: { type: Boolean, default: false },
}, { _id: false })

const BroadcastMessageSchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: { type: String, enum: ["bulk","ad"], required: true },
  audience: { type: String, enum: ["all","premium","active30"], required: true },

  ttlSec: { type: Number, required: true },
  deleteAt: { type: Date, index: true },   
  status: { type: String, enum: ["draft","queued","sent","deleted"], default: "draft", index: true },

  createdByTgId: { type: Number, required: true, index: true },

  deliveries: { type: [DeliverySchema], default: [] },
  stats: {
    total: { type: Number, default: 0 },
    ok:    { type: Number, default: 0 },
    fail:  { type: Number, default: 0 },
  }
}, { timestamps: true })

export type BroadcastMessageDoc = mongoose.InferSchemaType<typeof BroadcastMessageSchema>
export const BroadcastMessage =
  mongoose.models.BroadcastMessage || mongoose.model("BroadcastMessage", BroadcastMessageSchema)
