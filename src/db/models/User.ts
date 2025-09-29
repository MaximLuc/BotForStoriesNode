import mongoose from 'mongoose'
import type { Role } from '../../shared/constants'
import { ROLE } from '../../shared/constants'

const UserSchema = new mongoose.Schema({
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
}, { timestamps: true })

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema>
export const User  = mongoose.models.User  || mongoose.model('User',  UserSchema)

