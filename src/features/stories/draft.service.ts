import mongoose from 'mongoose'
import { DraftEnding, DraftStory, DraftStoryDoc } from '../../db/models/DraftStory'
import { Story } from '../../db/models/Story'

export async function getOrCreateDraft(tgId: number) {
  let d = await DraftStory.findOne({ tgId })
  if (!d) d = await DraftStory.create({ tgId, endings: [] })
    console.log('Draft story:', d)
  return d
}

export async function resetPending(tgId: number) {
  await DraftStory.updateOne({ tgId }, { $set: { pendingInput: null, updatedAt: new Date() } })
}

export async function setPending(tgId: number, pendingInput: any) {
  await DraftStory.updateOne({ tgId }, { $set: { pendingInput, updatedAt: new Date() } })
}

export async function setField(tgId: number, field: 'title'|'intro', value: string) {
  await DraftStory.updateOne({ tgId }, { $set: { [field]: value.trim(), updatedAt: new Date() } })
}

function hasBoth(e: DraftEnding): e is Required<Pick<DraftEnding, 'title'|'text'>> {
  return !!e.title && !!e.text && e.title.trim().length > 0 && e.text.trim().length > 0
}


export async function setEndingTitle(tgId: number, index: number, title: string) {
  const d = await getOrCreateDraft(tgId)
  if (!d.endings[index]) d.endings[index] = { title: '', text: '' }
  d.endings[index].title = title.trim()
  await d.save()
}

export async function setEndingText(tgId: number, index: number, text: string) {
  const d = await getOrCreateDraft(tgId)
  if (!d.endings[index]) d.endings[index] = { title: '', text: '' }
  d.endings[index].text = text.trim()
  await d.save()
}

export async function removeEnding(tgId: number, index: number) {
  const d = await getOrCreateDraft(tgId)
  d.endings.splice(index, 1)
  await d.save()
}

export function canCreate(d: { title?: string; intro?: string; endings: Array<{title?:string;text?:string}> }) {
  const hasEnding = d.endings.some(e => (e.title?.trim()?.length ?? 0) > 0 && (e.text?.trim()?.length ?? 0) > 0)
  return !!(d.title && d.title.trim().length >= 3) &&
         !!(d.intro && d.intro.trim().length >= 10) &&
         hasEnding
}

export async function commitDraftToStory(tgId: number) {
  const conn = mongoose.connection
  console.log('[commit] using db=%s coll=%s',
    conn.name, (Story.collection as any).name)

  const draft = await DraftStory.findOne({ tgId }) as DraftStoryDoc | null
  if (!draft) throw new Error('Draft not found')

  const endings = (draft.endings as DraftEnding[]).filter(hasBoth).slice(0, 3)
  if (!draft.title || !draft.intro || endings.length === 0) throw new Error('Draft incomplete')

  const before = await Story.countDocuments({}).exec()
  console.log('[commit] stories before insert =', before)

  const story = await Story.create({
    title: draft.title.trim(),
    text: draft.intro.trim(),
    endings: endings.map(e => ({ title: e.title!.trim(), text: e.text!.trim() })),
    minRank: draft.minRank ?? 0,
    isPublished: true,
  })

  const check = await Story.findById(story._id).lean()
  console.log('[commit] inserted id=', String(story._id), 'foundBack=', !!check)

  const after = await Story.countDocuments({}).exec()
  console.log('[commit] stories after insert =', after)

  if (!check) throw new Error('Create failed: not found after insert')

  await DraftStory.deleteOne({ tgId }).catch(err =>
    console.warn('[commit] warn: failed to delete draft:', err)
  )

  return story
}


