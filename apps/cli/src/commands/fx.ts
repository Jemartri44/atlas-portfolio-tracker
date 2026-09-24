// atlas fx update | atlas fx status: the official history of the ECB
// reference rates, next to the ledger (ADR-0029, points 1-3 and 6).
//
// The console is the only place that downloads: the web never asks a third
// party for anything (ADR-0028). It downloads the ZIP — the API only as a
// fallback, and said so —, reads it before writing anything, and keeps it in
// `reference/ecb/` under the lock of the folder. A download that changes a
// rate already published is kept apart and the previous history stays in
// force: that is a finding, and it is said.

import { dirname } from "node:path";
import { EcbFxRateSource, FileEcbHistoryStore, readLocalConfig } from "@atlas/adapters";
import { todayInMadrid } from "@atlas/domain";
import {
  type EcbUpdateResult,
  firstRateDateOf,
  latestPublication,
  readEcbHistory,
  updateEcbHistory,
} from "@atlas/domain/ecb";
import { assertKnownFlags, type Flags, UsageError } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { day, describeCalendar, describeRejected, sourceName } from "../output/ecb.js";
import { correctRates } from "./rule-change.js";
import { render } from "./shared.js";

const describeUpdate = (result: EcbUpdateResult): string[] => {
  const lines: string[] = [];
  if (result.zip_failure !== undefined) {
    lines.push(
      `El ZIP oficial no se ha podido usar (${result.zip_failure}): se ha descargado de la API de datos del BCE y se guarda tal cual, como API, nunca como si fuera el ZIP.`,
    );
  }
  if (result.kind === "rejected") {
    return [...lines, ...describeRejected(result)];
  }
  lines.push(
    result.newDays === 0
      ? `Histórico del BCE al día (${sourceName(result.stored.source)}): no hay días nuevos; el último publicado es el ${day(result.latest)}.`
      : `Histórico del BCE actualizado desde ${sourceName(result.stored.source)}: ${result.newDays} ${result.newDays === 1 ? "día nuevo" : "días nuevos"}, hasta el ${day(result.latest)}. Guardado en reference/ecb/${result.stored.file}.`,
  );
  lines.push(...describeCalendar(result.calendar));
  return lines;
};

export const fxCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const sub = positionals[1];
  if (sub === "correct") {
    return correctRates(ctx, flags);
  }
  assertKnownFlags(flags, [...GLOBAL_FLAGS]);
  const folder = dirname(ctx.ledgerPath);
  const store = new FileEcbHistoryStore(folder);
  if (sub === "status") {
    const active = await store.active();
    if (active === undefined) {
      render(
        ctx,
        { stored: false },
        "No hay histórico del BCE junto al libro: descárgalo con `atlas fx update`. Sin él, los tipos del libro no se contrastan.",
      );
      return 0;
    }
    const latest = latestPublication(readEcbHistory(active.text, active.meta.source));
    const rejected = (await store.manifest())?.rejected.length ?? 0;
    render(
      ctx,
      { stored: true, active: active.meta, latest, rejected },
      [
        `Histórico del BCE en vigor: reference/ecb/${active.meta.file}, ${sourceName(active.meta.source)}, descargado el ${active.meta.fetched_at}; último día publicado, el ${day(latest)}.`,
        ...(rejected === 0
          ? []
          : [
              `Hay ${rejected} ${rejected === 1 ? "descarga guardada aparte" : "descargas guardadas aparte"} por contradecir tipos ya publicados (reference/ecb/rejected/).`,
            ]),
      ].join("\n"),
    );
    return 0;
  }
  if (sub !== "update") {
    throw new UsageError("uso: atlas fx update | atlas fx status");
  }
  const { events } = await ctx.deps.store.load();
  const result = await updateEcbHistory(
    { source: ctx.fxSource?.() ?? new EcbFxRateSource(), store },
    { firstRateDate: firstRateDateOf(events), today: todayInMadrid(ctx.deps.clock) },
  );
  // The threshold is read so a broken local configuration is said now, not
  // on the next registration.
  await readLocalConfig(folder);
  render(ctx, result, describeUpdate(result).join("\n"));
  return result.kind === "rejected" ? EXIT.domain : EXIT.ok;
};
