import mammoth from "mammoth"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)

const iconvLite: typeof import("iconv-lite") = require("iconv-lite")
const chardet: typeof import("chardet") = require("chardet")


function normalizeEncoding(enc: string): string {
  const e = (enc || "").toLowerCase()
  if (e.startsWith("windows-")) return e
  if (e === "utf-8" || e === "utf8") return "utf8"
  if (e === "utf-16le" || e === "utf16le") return "utf16-le"
  if (e === "utf-16be" || e === "utf16be") return "utf16-be"
  if (e.includes("1251")) return "windows-1251"
  if (e.includes("1252")) return "windows-1252"
  return e
}

function decodeTextBuffer(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString("utf8").replace(/^\uFEFF/, "")
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return iconvLite.decode(buf, "utf16-le").replace(/^\uFEFF/, "")
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return iconvLite.decode(buf, "utf16-be").replace(/^\uFEFF/, "")
  }

  const guess = (chardet as any).detect?.(buf) || "UTF-8"
  try {
    return iconvLite.decode(buf, normalizeEncoding(guess))
  } catch {
    for (const enc of ["utf8", "windows-1251", "windows-1252", "iso-8859-1"]) {
      try { return iconvLite.decode(buf, enc) } catch {}
    }
    return buf.toString("utf8")
  }
}


function rtfBufferToPlain(buf: Buffer): string {

  const src = buf.toString("latin1")

  let codepage = "windows-1252"
  const mCpg = src.match(/\\ansicpg(\d+)/i)
  if (mCpg) codepage = `windows-${mCpg[1]}`

  let uc = 1
  const mUc = src.match(/\\uc(\d+)/i)
  if (mUc) uc = Math.max(0, parseInt(mUc[1], 10) || 1)

  const out: string[] = []
  const len = src.length

  const pushHexByte = (hh: string) => {
    const b = Buffer.from([parseInt(hh, 16)])
    out.push(iconvLite.decode(b, codepage))
  }

  for (let i = 0; i < len; i++) {
    const ch = src[i]

    if (ch === "{") continue
    if (ch === "}") continue

    if (ch !== "\\") {
      out.push(ch)
      continue
    }

    i++
    if (i >= len) break

    const nxt = src[i]

    if (nxt === "\\" || nxt === "{" || nxt === "}") { out.push(nxt); continue }
    if (nxt === "~") { out.push("\u00A0"); continue } 
    if (nxt === "-") { out.push("\u2011"); continue }  
    if (nxt === "_") { out.push("\u2011"); continue }

    if (nxt === "'") {
      const hh = src.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hh)) {
        pushHexByte(hh)
        i += 2
      }
      continue
    }

    let j = i
    while (j < len && /[a-zA-Z]/.test(src[j])) j++
    const word = src.slice(i, j)

    let k = j
    let sign = 1
    if (src[k] === "-") { sign = -1; k++ }
    let numStr = ""
    while (k < len && /[0-9]/.test(src[k])) { numStr += src[k]; k++ }
    const hasNum = numStr.length > 0
    const numVal = hasNum ? sign * parseInt(numStr, 10) : undefined

    if (src[k] === " ") k++

    switch (word.toLowerCase()) {
      case "par":
      case "line":
        out.push("\n"); break
      case "tab":
        out.push("\t"); break
      case "emdash":
        out.push("\u2014"); break
      case "endash":
        out.push("\u2013"); break
      case "uc":
        if (typeof numVal === "number" && numVal >= 0) uc = numVal
        break
      case "ansicpg":
        if (typeof numVal === "number") codepage = `windows-${numVal}`
        break
      case "u":
        if (typeof numVal === "number") {
          const cp = numVal < 0 ? 65536 + numVal : numVal
          try { out.push(String.fromCodePoint(cp)) } catch {}
          i = k - 1
          for (let s = 0; s < uc && i + 1 < len; s++) i++
        }
        break
      default:
        break
    }

    i = k - 1
  }

  return out.join("")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}


export async function bufferToText(buf: Buffer, mime: string, filename?: string): Promise<string> {
  const lower = (mime || "").toLowerCase()
  const name = (filename || "").toLowerCase()

  if (lower.includes("wordprocessingml.document") || name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: buf })
    return normalizeText(value)
  }

  if (lower.includes("rtf") || name.endsWith(".rtf")) {
    return normalizeText(rtfBufferToPlain(buf))
  }

  return normalizeText(decodeTextBuffer(buf))
}

function normalizeText(s: string): string {
  return (s || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}


type EndingParsed = { title?: string; text?: string }
export type ParsedStory = {
  title?: string
  intro?: string
  endings: EndingParsed[]
}

const TAGS = {
  TITLE: ["TITLE", "НАЗВАНИЕ"],
  INTRO: ["INTRO", "НАЧАЛО"],
  E1T: ["ENDING1_TITLE", "ПРОДОЛЖЕНИЕ1_НАЗВАНИЕ"],
  E1X: ["ENDING1_TEXT", "ПРОДОЛЖЕНИЕ1_ТЕКСТ"],
  E2T: ["ENDING2_TITLE", "ПРОДОЛЖЕНИЕ2_НАЗВАНИЕ"],
  E2X: ["ENDING2_TEXT", "ПРОДОЛЖЕНИЕ2_ТЕКСТ"],
  E3T: ["ENDING3_TITLE", "ПРОДОЛЖЕНИЕ3_НАЗВАНИЕ"],
  E3X: ["ENDING3_TEXT", "ПРОДОЛЖЕНИЕ3_ТЕКСТ"],
}

function tagRe(names: string[]) {
  const or = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  return new RegExp(`^\\s*(?:${or})\\s*:`, "i")
}

function captureBlock(src: string, startTag: RegExp, nextTags: RegExp[]): { value?: string; rest: string } {
  const lines = src.split(/\r?\n/)
  let i = 0
  while (i < lines.length && !startTag.test(lines[i])) i++
  if (i >= lines.length) return { rest: src }

  lines[i] = lines[i].replace(startTag, "").trim()
  const out: string[] = []
  let j = i
  if (lines[j]) out.push(lines[j])
  j++
  for (; j < lines.length; j++) {
    const ln = lines[j]
    if (nextTags.some(re => re.test(ln))) break
    out.push(ln)
  }
  const value = out.join("\n").trim()
  const rest = lines.slice(j).join("\n")
  return { value, rest }
}

export function parseStoryFromText(raw: string): ParsedStory {
  let text = raw.replace(/^\uFEFF/, "").replace(/\r/g, "\n")
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
