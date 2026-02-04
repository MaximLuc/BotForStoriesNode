import mongoose from "mongoose";

const DailyButtonsSchema = new mongoose.Schema(
  {
    date: { type: String, unique: true, index: true }, // YYYY-MM-DD
    buttons: { type: Object, default: {} },            // { "read_stories": 12, "audio:open:...": 5, ... }
    updates: { type: Object, default: {} },            // optional: { "callback_query": 100, "message": 20 }
  },
  { timestamps: true }
);

export const DailyButtons =
  mongoose.models.DailyButtons || mongoose.model("DailyButtons", DailyButtonsSchema);
