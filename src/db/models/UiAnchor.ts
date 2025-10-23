import mongoose, { Schema, Model } from "mongoose";
import type { InferSchemaType } from "mongoose";
const UiAnchorSchema = new Schema({
  userId:   { type: Number, index: true, required: true },
  chatId:   { type: Number, index: true, required: true },
  messageId:{ type: Number, required: true },
  updatedAt:{ type: Date,   default: Date.now },
}, { timestamps: true });

UiAnchorSchema.index({ userId: 1, chatId: 1 }, { unique: true });

export type UiAnchorDoc = InferSchemaType<typeof UiAnchorSchema>;

export const UiAnchor: Model<UiAnchorDoc> =
  mongoose.models.UiAnchor ||
  mongoose.model<UiAnchorDoc>("UiAnchor", UiAnchorSchema);
