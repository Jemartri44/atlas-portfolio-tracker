// atlas m720 <año> · atlas m721 <año> — the informative returns, as JSON.
//
// Two commands and not `atlas tax 720`, which the argument parser would read as the tax year 720.
// The web (Fiscal) is where they are read; the console keeps the report for checking a verdict
// without it. What counts, what it is worth, whether it obliges and why is decided in
// `packages/domain/src/informative/`.

import { todayInMadrid } from "@atlas/domain";
import { informativeReturn } from "@atlas/domain/fiscal";
import { assertKnownFlags, type Flags } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { jsonText, loadForQuery, reportYear } from "./shared.js";

const USAGE = "uso: atlas m720 <año> · atlas m721 <año>";

/** `atlas m720 <año>` and `atlas m721 <año>`: the same command with its model fixed. */
const informativeCommand =
  (model: "720" | "721") =>
  async (ctx: Context, positionals: string[], flags: Flags): Promise<number> => {
    assertKnownFlags(flags, [...GLOBAL_FLAGS]);
    const year = reportYear(ctx, positionals[1], USAGE, `el modelo ${model}`);
    const today = todayInMadrid(ctx.deps.clock);
    const { events } = await loadForQuery(ctx);
    ctx.io.out(jsonText(informativeReturn(events, model, year, { today })));
    return 0;
  };

export const m720Command = informativeCommand("720");
export const m721Command = informativeCommand("721");
