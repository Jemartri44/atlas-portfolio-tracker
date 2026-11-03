// How the console speaks the one catalogue of messages (`@atlas/domain/messages`): ids as they are,
// figures raw (the console is the exact view), dates in ISO. The web has its own voice.

import type { Voice } from "@atlas/domain/messages";
import { text } from "./format.js";

const list = (value: unknown): string =>
  Array.isArray(value) ? value.map((entry) => text(entry)).join(", ") : text(value);

export const CLI_VOICE: Voice = {
  surface: "cli",
  text,
  one: text,
  many: list,
  thesis: text,
  money: (value) => `${text(value)} EUR`,
  quantity: text,
  titles: (value) => `${text(value)} ${/^\+?1(\.0*)?$/.test(text(value)) ? "título" : "títulos"}`,
  evidence: text,
  date: text,
  num: text,
  pct: (value) => `${text(value)} %`,
  pp: (value) => `${text(value)} pp`,
  field: text,
  fields: (value) =>
    Array.isArray(value) ? value.map((entry) => text(entry)).join(" o ") : text(value),
  kind: text,
  word: text,
  setting: text,
  days: (value) => (text(value) === "1" ? "1 día" : `${text(value)} días`),
  count: (value) => (Array.isArray(value) ? value.length : 0),
};
