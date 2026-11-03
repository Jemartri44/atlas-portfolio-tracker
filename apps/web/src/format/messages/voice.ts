// How the web speaks the one catalogue of messages (`@atlas/domain/messages`): names instead of
// ids, Spanish numbers and dates, labels instead of keys, and the privacy mask on every amount and
// quantity. The console has its own voice.

import type { Voice } from "@atlas/domain/messages";
import { NO_NAMES, namingOf } from "../names.js";
import { figuresOf, type Prose } from "../privacy.js";
import {
  count,
  day,
  days,
  enumValue,
  field,
  fields,
  kind,
  num,
  pct,
  pp,
  setting,
  text,
} from "./prose.js";

export const webVoice = (prose: Prose): Voice => {
  const naming = namingOf(prose.names ?? NO_NAMES);
  const figures = figuresOf(prose.privacy);
  return {
    surface: "web",
    text,
    one: naming.one,
    many: naming.many,
    thesis: naming.thesis,
    money: figures.money,
    quantity: figures.quantity,
    titles: figures.titles,
    evidence: figures.evidence,
    date: day,
    num,
    pct,
    pp,
    field,
    fields,
    kind,
    word: enumValue,
    setting,
    days,
    count,
  };
};
