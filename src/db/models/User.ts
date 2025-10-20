import mongoose from "mongoose";
import type { Role } from "../../shared/constants.js";
import { ROLE } from "../../shared/constants.js";

const UserSchema = new mongoose.Schema(
  {
    tgId: { type: Number, unique: true, required: true },
    firstName: String,
    username: String,

    role: {
      type: String,
      enum: Object.values(ROLE),
      default: ROLE.USER,
      index: true,
    },

    premiumUntil: { type: Date, default: null },
    features: { type: [String], default: [] },

    starterTokensGranted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema>;
export const User = mongoose.models.User || mongoose.model("User", UserSchema);
