// atlas tax <año> [--boxes] — the savings base of a tax year, as JSON.
//
// The web (Fiscal) is where the report is read; the console keeps the machine-readable report so
// that a figure can be checked without the web. Every figure, criterion and note comes from
// `taxYear` in the domain; the lots each transmission consumed are in the report itself.

import { todayInMadrid } from "@atlas/domain";
import { taxBoxes, taxBoxesJson, taxReportJson, taxYear } from "@atlas/domain/fiscal";
import { assertKnownFlags, booleanFlag, type Flags } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { rateFindingsOf } from "./rates.js";
import { jsonText, reportYear, warnIfLedgerMissing } from "./shared.js";

const USAGE = "uso: atlas tax <año> [--boxes]";

export const taxCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["boxes", ...GLOBAL_FLAGS]);
  const year = reportYear(ctx, positionals[1], USAGE, "atlas tax");
  await warnIfLedgerMissing(ctx);
  const { events } = await ctx.deps.store.load();
  const today = todayInMadrid(ctx.deps.clock);
  // The findings of the ECB check note the lines that depend on them; they
  // move no figure (ADR-0029, point 8).
  const options = { today, rateFindings: await rateFindingsOf(ctx) };
  const report = booleanFlag(flags, "boxes")
    ? taxBoxesJson(taxBoxes(events, year, options))
    : taxReportJson(taxYear(events, year, options));
  ctx.io.out(jsonText(report));
  return 0;
};
