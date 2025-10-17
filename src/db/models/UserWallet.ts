import mongoose, { Types } from "mongoose"

export interface IUserWallet {
  _id: Types.ObjectId
  userId: Types.ObjectId
  tgId?: number
  tokens: number
  createdAt: Date
  updatedAt: Date
}

const UserWalletSchema = new mongoose.Schema<IUserWallet>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, index: true, required: true },
  tgId:   { type: Number, index: true },
  tokens: { type: Number, default: 0 },
}, { timestamps: true })

export type UserWalletDoc = mongoose.HydratedDocument<IUserWallet>
export const UserWallet =
  mongoose.models.UserWallet as mongoose.Model<IUserWallet> ||
  mongoose.model<IUserWallet>("UserWallet", UserWalletSchema)
