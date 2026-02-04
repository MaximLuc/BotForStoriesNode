import { Story } from "../../db/models/Story.js";

export function startStoryPublisherJob() {
  const intervalMs = 20_000;

  setInterval(async () => {
    try {
      const now = new Date();
      await Story.updateMany(
        { isPublished: false, publishAt: { $ne: null, $lte: now } },
        { $set: { isPublished: true, publishedAt: now }, $unset: { publishAt: "" } }
      );
    } catch (e) {
      console.error("[publisherJob] error:", e);
    }
  }, intervalMs);
}
