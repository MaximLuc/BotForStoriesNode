import type { Context } from "telegraf";
import type { UserDoc } from "../db/models/User";

export type MyContext = Context & {
  state: Context["state"] & {
    user?: UserDoc;
  };
};
