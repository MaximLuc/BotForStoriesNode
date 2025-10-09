import mammoth from 'mammoth' 

function rtfToPlain(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      try { return Buffer.from(hex, 'hex').toString('utf8') } catch { return '' }
    })
    .replace(/\\[a-z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function bufferToText(buf: Buffer, mime: string, filename?: string): Promise<string> {
  const lower = (mime || '').toLowerCase()
  const name = (filename || '').toLowerCase()
  if (lower.includes('wordprocessingml.document') || name.endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ buffer: buf })
    return value.trim()
  }
  if (lower.includes('rtf') || name.endsWith('.rtf')) {
    return rtfToPlain(buf.toString('utf8'))
  }
  return buf.toString('utf8')
}


type EndingParsed = { title?: string; text?: string }
export type ParsedStory = {
  title?: string
  intro?: string
  endings: EndingParsed[]
}

const TAGS = {
  TITLE: ['TITLE', 'НАЗВАНИЕ'],
  INTRO: ['INTRO', 'НАЧАЛО'],
  E1T: ['ENDING1_TITLE', 'ПРОДОЛЖЕНИЕ1_НАЗВАНИЕ'],
  E1X: ['ENDING1_TEXT', 'ПРОДОЛЖЕНИЕ1_ТЕКСТ'],
  E2T: ['ENDING2_TITLE', 'ПРОДОЛЖЕНИЕ2_НАЗВАНИЕ'],
  E2X: ['ENDING2_TEXT', 'ПРОДОЛЖЕНИЕ2_ТЕКСТ'],
  E3T: ['ENDING3_TITLE', 'ПРОДОЛЖЕНИЕ3_НАЗВАНИЕ'],
  E3X: ['ENDING3_TEXT', 'ПРОДОЛЖЕНИЕ3_ТЕКСТ'],
}

function tagRe(names: string[]) {
  const or = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(`^\\s*(?:${or})\\s*:`, 'i')
}

function captureBlock(src: string, startTag: RegExp, nextTags: RegExp[]): { value?: string; rest: string } {
  const lines = src.split(/\r?\n/)
  let i = 0
  while (i < lines.length && !startTag.test(lines[i])) i++
  if (i >= lines.length) return { rest: src }

  lines[i] = lines[i].replace(startTag, '').trim()
  const out: string[] = []
  let j = i
  if (lines[j]) out.push(lines[j])
  j++
  for (; j < lines.length; j++) {
    const ln = lines[j]
    if (nextTags.some(re => re.test(ln))) break
    out.push(ln)
  }
  const value = out.join('\n').trim()
  const rest = lines.slice(j).join('\n')
  return { value, rest }
}

export function parseStoryFromText(raw: string): ParsedStory {
  let text = raw.replace(/^\uFEFF/, '').replace(/\r/g, '\n')
  const nextAll = [
    tagRe(TAGS.TITLE), tagRe(TAGS.INTRO),
    tagRe(TAGS.E1T), tagRe(TAGS.E1X),
    tagRe(TAGS.E2T), tagRe(TAGS.E2X),
    tagRe(TAGS.E3T), tagRe(TAGS.E3X),
  ]

  const res: ParsedStory = { endings: [] }

  let b = captureBlock(text, tagRe(TAGS.TITLE), nextAll)
  if (b.value) res.title = b.value
  text = b.rest

  b = captureBlock(text, tagRe(TAGS.INTRO), nextAll)
  if (b.value) res.intro = b.value
  text = b.rest

  let e1: EndingParsed = {}
  b = captureBlock(text, tagRe(TAGS.E1T), nextAll); if (b.value) e1.title = b.value; text = b.rest
  b = captureBlock(text, tagRe(TAGS.E1X), nextAll); if (b.value) e1.text  = b.value; text = b.rest
  if (e1.title || e1.text) res.endings.push(e1)

  let e2: EndingParsed = {}
  b = captureBlock(text, tagRe(TAGS.E2T), nextAll); if (b.value) e2.title = b.value; text = b.rest
  b = captureBlock(text, tagRe(TAGS.E2X), nextAll); if (b.value) e2.text  = b.value; text = b.rest
  if (e2.title || e2.text) res.endings.push(e2)

  let e3: EndingParsed = {}
  b = captureBlock(text, tagRe(TAGS.E3T), nextAll); if (b.value) e3.title = b.value; text = b.rest
  b = captureBlock(text, tagRe(TAGS.E3X), nextAll); if (b.value) e3.text  = b.value; text = b.rest
  if (e3.title || e3.text) res.endings.push(e3)

  res.endings = res.endings.slice(0, 3).map(e => ({
    title: e.title?.trim(),
    text: e.text?.trim(),
  }))

  return res
}
