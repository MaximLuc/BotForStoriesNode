import dotenv from "dotenv";
dotenv.config({ path: ".env" });

export const cfg = {
  botToken: process.env.BOT_TOKEN || "",
  mongoUrl: process.env.MONGO_URL || "",
  payProviderToken: process.env.PAY_PROVIDER_TOKEN || "",
  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
};
