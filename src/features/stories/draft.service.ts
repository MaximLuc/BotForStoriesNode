import {
  DraftEnding,
  DraftStory,
  DraftStoryDoc,
} from "../../db/models/DraftStory";
import { Story } from "../../db/models/Story";

export async function getOrCreateDraft(tgId: number) {
  let d = await DraftStory.findOne({ tgId });
  if (!d) d = await DraftStory.create({ tgId, endings: [] });
  console.log("Draft story:", d);
  return d;
}

export async function resetPending(tgId: number) {
  await DraftStory.updateOne(
    { tgId },
    { $set: { pendingInput: null, updatedAt: new Date() } }
  );
}

export async function setPending(tgId: number, pendingInput: any) {
  await DraftStory.updateOne(
    { tgId },
    { $set: { pendingInput, updatedAt: new Date() } }
  );
}

export async function setField(
  tgId: number,
  field: "title" | "intro",
  value: string
) {
  await DraftStory.updateOne(
    { tgId },
    { $set: { [field]: value.trim(), updatedAt: new Date() } }
  );
}

function hasBoth(
  e: DraftEnding
): e is DraftEnding & { title: string; text: string } {
  return (
    typeof e.title === "string" &&
    e.title.trim().length > 0 &&
    typeof e.text === "string" &&
    e.text.trim().length > 0
  );
}

export async function setEndingTitle(
  tgId: number,
  index: number,
  title: string
) {
  const d = await getOrCreateDraft(tgId);
  if (!d.endings[index]) d.endings[index] = { title: "", text: "" };
  d.endings[index].title = title.trim();
  await d.save();
}

export async function setEndingText(tgId: number, index: number, text: string) {
  const d = await getOrCreateDraft(tgId);
  if (!d.endings[index]) d.endings[index] = { title: "", text: "" };
  d.endings[index].text = text.trim();
  await d.save();
}

export async function removeEnding(tgId: number, index: number) {
  const d = await getOrCreateDraft(tgId);
  d.endings.splice(index, 1);
  await d.save();
}

export async function setStoryAccess(tgId: number, minRank: 0 | 1) {
  await DraftStory.updateOne(
    { tgId },
    { $set: { minRank, updatedAt: new Date() } }
  );
}
export async function setEndingAccess(
  tgId: number,
  index: number,
  minRank: 0 | 1
) {
  const d = await getOrCreateDraft(tgId);
  if (!d.endings[index]) d.endings[index] = { title: "", text: "", minRank: 0 };
  d.endings[index].minRank = minRank;
  await d.save();
}

export function canCreate(d: {
  title?: string;
  intro?: string;
  endings: Array<{ title?: string; text?: string }>;
}) {
  const hasEnding = d.endings.some(
    (e) =>
      (e.title?.trim()?.length ?? 0) > 0 && (e.text?.trim()?.length ?? 0) > 0
  );
  return (
    !!(d.title && d.title.trim().length >= 3) &&
    !!(d.intro && d.intro.trim().length >= 10) &&
    hasEnding
  );
}

export async function commitDraftToStory(tgId: number) {
  const d = (await DraftStory.findOne({ tgId })) as DraftStoryDoc | null;
  if (!d) throw new Error("Draft not found");

  const endings = (d.endings as DraftEnding[]).filter(hasBoth).slice(0, 3);
  if (!d.title || !d.intro || endings.length === 0)
    throw new Error("Draft incomplete");

  const story = await Story.create({
    title: d.title.trim(),
    text: d.intro.trim(),
    endings: endings.map((e) => ({
      title: e.title!.trim(),
      text: e.text!.trim(),
      minRank: e.minRank ?? 0,
    })),
    minRank: d.minRank ?? 0,
    isPublished: true,
  });

  await DraftStory.deleteOne({ tgId }).catch(() => {});
  return story;
}
