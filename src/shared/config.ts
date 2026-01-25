import dotenv from "dotenv";
dotenv.config({ path: ".env" });

export const cfg = {
  botToken: process.env.BOT_TOKEN || "",
  mongoUrl: process.env.MONGO_URL || "",
  payProviderToken: process.env.PAY_PROVIDER_TOKEN || "",

  kassaTaxSystemCode: Number(process.env.KASSA_TAX_SYSTEM_CODE || 1),
  kassaVatCode: Number(process.env.KASSA_VAT_CODE || 1),
  kassaPaymentSubject: process.env.KASSA_PAYMENT_SUBJECT || "service",
  
  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
};
