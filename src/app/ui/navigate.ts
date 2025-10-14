import type { MyContext } from "../../shared/types";
import { respond } from "./respond";
import { getScreen, type ScreenId } from "./screens";

export async function navigate(ctx: MyContext, id: ScreenId) {
  const payload = await getScreen(ctx, id);
  return respond(ctx, payload.text, {
    inline: payload.inline,
    setReplyKeyboard: payload.setReplyKeyboard,
    replyNoticeText: payload.replyNoticeText,
    parseMode: payload.parseMode ?? "Markdown",
  });
}
