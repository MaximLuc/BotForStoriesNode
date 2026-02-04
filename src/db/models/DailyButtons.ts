import mongoose from "mongoose";

const DailyButtonsSchema = new mongoose.Schema(
  {
    date: { type: String, unique: true, index: true },
    buttons: { type: Object, default: {} },           
    updates: { type: Object, default: {} },           
  },
  { timestamps: true }
);

export const DailyButtons =
  mongoose.models.DailyButtons || mongoose.model("DailyButtons", DailyButtonsSchema);
