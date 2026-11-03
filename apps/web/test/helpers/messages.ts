// The sentence of a code of the one catalogue, in the web's voice, for the tests that read texts.

import { ERRORS, render, WARNINGS } from "@atlas/domain/messages";
import { webVoice } from "../../src/format/messages/voice.js";
import { type NameIndex, NO_NAMES } from "../../src/format/names.js";

export const NAMES: NameIndex = {
  ast_world: "World Index Fund",
  acc_mi: "Fondos indexados",
  "tesis:th_alpha": "sobre Alpha Robotics (abierta el 01/09/2026)",
};

const said =
  (table: typeof ERRORS) =>
  (code: string, details: Record<string, unknown>, names: NameIndex = NAMES, privacy = false) => {
    const entry = table[code];
    if (entry === undefined) {
      throw new Error(`no entry for ${code}`);
    }
    return render(entry, details, webVoice({ names: names ?? NO_NAMES, privacy }), "");
  };

export const sayError = said(ERRORS);
export const sayWarning = said(WARNINGS);
