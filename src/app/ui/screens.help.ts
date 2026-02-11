import { Markup } from "telegraf";
import type { MyContext } from "../../shared/types.js";
import {
  HELP_SECTIONS,
  HELP_TEXT_INDEX,
  HELP_TEXT_GENERAL,
  HELP_TEXT_STORIES,
  HELP_TEXT_AUDIO,
  HELP_TEXT_KEYS,
  HELP_TEXT_BUTTONS,
  HELP_TEXT_OTHER,
  type HelpSectionId,
} from "./texts.help.js";

function kbIndex() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(HELP_SECTIONS.general.title, "help:general")],
    [Markup.button.callback(HELP_SECTIONS.stories.title, "help:stories")],
    [Markup.button.callback(HELP_SECTIONS.audio.title, "help:audio")],
    [Markup.button.callback(HELP_SECTIONS.keys.title, "help:keys")],
    [Markup.button.callback(HELP_SECTIONS.buttons.title, "help:buttons")],
    [Markup.button.callback(HELP_SECTIONS.other.title, "help:other")],
    [Markup.button.callback("🏠 В меню", "main")],
  ]);
}

function kbSection(withSupport = false) {
  const rows: any[] = [
    [Markup.button.callback("↩︎ К разделам", "help")],
    [Markup.button.callback("🏠 В меню", "main")],
  ];
  if (withSupport) rows.splice(1, 0, [Markup.button.callback("🆘 Техподдержка", "support")]);
  return Markup.inlineKeyboard(rows);
}

function sectionText(id: HelpSectionId) {
  if (id === "general") return HELP_TEXT_GENERAL;
  if (id === "stories") return HELP_TEXT_STORIES;
  if (id === "audio") return HELP_TEXT_AUDIO;
  if (id === "keys") return HELP_TEXT_KEYS;
  if (id === "buttons") return HELP_TEXT_BUTTONS;
  return HELP_TEXT_OTHER;
}

export async function renderHelpIndexScreen(ctx: MyContext) {
  const lines = [
    HELP_TEXT_INDEX,
    "",
    `<b>${HELP_SECTIONS.general.title}</b> — ${HELP_SECTIONS.general.short}`,
    `<b>${HELP_SECTIONS.stories.title}</b> — ${HELP_SECTIONS.stories.short}`,
    `<b>${HELP_SECTIONS.audio.title}</b> — ${HELP_SECTIONS.audio.short}`,
    `<b>${HELP_SECTIONS.keys.title}</b> — ${HELP_SECTIONS.keys.short}`,
    `<b>${HELP_SECTIONS.buttons.title}</b> — ${HELP_SECTIONS.buttons.short}`,
    `<b>${HELP_SECTIONS.other.title}</b> — ${HELP_SECTIONS.other.short}`,
  ];

  return {
    text: lines.join("\n"),
    inline: kbIndex(),
    parseMode: "HTML" as const,
  };
}

export async function renderHelpSectionScreen(ctx: MyContext, id: HelpSectionId) {
  const text = sectionText(id);
  const inline = id === "other" ? kbSection(true) : kbSection(false);
  return { text, inline, parseMode: "HTML" as const };
}
