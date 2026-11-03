import type { Say } from "./voice.js";

/** What an integrity finding means and what to do about it. */
export interface FindingEntry {
  what: Say;
  todo: Say;
}

export const FINDINGS: Record<string, FindingEntry> = {};
