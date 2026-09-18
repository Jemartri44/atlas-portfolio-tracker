// The synthetic golden ledger, read from the repository fixture: 200 events,
// four accounts, fifteen assets, nine theses, seven corporate actions and one
// reversal. It is the same file the manual walkthrough uses (quickstart.md), so
// the tests and the hand check look at the same data.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeLine, type LedgerEvent } from "@atlas/domain";

const here = dirname(fileURLToPath(import.meta.url));

export const GOLDEN_PATH = join(here, "../../../../tests/fixtures/ledger/synthetic-v1.jsonl");

export const goldenText = (): string => readFileSync(GOLDEN_PATH, "utf8");

export const goldenLines = (): string[] =>
  goldenText()
    .split("\n")
    .filter((line) => line.length > 0);

export const goldenEvents = (): LedgerEvent[] =>
  goldenLines().map((line) => decodeLine(line).event);
