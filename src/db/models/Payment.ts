import { Schema, model, type InferSchemaType } from "mongoose";

const PaymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    tgId: { type: Number, index: true },

    kind: { type: String, required: true },
    packId: { type: String },
    tokens: { type: Number, required: true },

    currency: { type: String, required: true },
    totalAmount: { type: Number, required: true }, 

    telegramChargeId: { type: String, required: true, unique: true },
    providerChargeId: { type: String }, 

    invoicePayload: { type: String },
  },
  { timestamps: true }
);

export type IPayment = InferSchemaType<typeof PaymentSchema>;
export const Payment = model("Payment", PaymentSchema);
