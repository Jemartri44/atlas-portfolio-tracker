// atlas compact [--yes] [--accept-unverified <id>]…: plan → show lines per
// version and the archive name → confirm → rewrite (the store archives the
// original bytes first).
//
// **Compacting is the only way of migrating the ledger to a new schema
// version**, so a ledger that cannot be compacted is frozen for ever
// (ADR-0025). Refusing is still what happens by default; the way out is asked
// for by name, one filing at a time, and it is **recorded in the ledger**.

import { dirname } from "node:path";
import { folderSyncPresence } from "@atlas/adapters";
import { type CompactPlan, compactLedger, planCompact, type UnverifiedFiling } from "@atlas/domain";
import { compactPermission, RefusedError } from "@atlas/domain/sync";
import { assertKnownFlags, type Flags, listFlag } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { confirm, render } from "./shared.js";

const REASON: Record<string, string> = {
  digest: "los movimientos anteriores ya no son los que había cuando se presentó",
  unreadable: "los movimientos anteriores no se pueden leer en el formato que dice su huella",
  lines: "la huella cubre un número de movimientos distinto del que tiene delante",
};

/**
 * What the user is giving up, one filing at a time, **before** being asked.
 * It says what will be given up and nothing about it being recorded: that is
 * not known until the rewrite has gone through, and saying it first is
 * affirming what has not happened (review of feature 011, decision (g)).
 */
const describeWaivers = (waiving: readonly UnverifiedFiling[]): string =>
  [
    "Vas a compactar renunciando a verificar la huella de estas declaraciones:",
    ...waiving.map((entry) => `  ${entry.filing_id}: ${REASON[entry.reason] ?? entry.reason}`),
  ].join("\n");

/** And what **is** recorded, said once the compaction has finished. */
const describeRecorded = (waived: readonly UnverifiedFiling[]): string[] =>
  waived.length === 0
    ? []
    : [
        `Registrado en tus propios datos: ${waived.length === 1 ? "la renuncia a verificar la huella" : `las ${waived.length} renuncias a verificar la huella`}, con su motivo y la fecha de hoy. \`atlas check\` lo dirá siempre.`,
      ];

const describePlan = (plan: CompactPlan): string =>
  [
    `Líneas por schema_version: ${plan.versions.map((v) => `v${v.version}: ${v.lines}`).join(" · ")} (versión destino: ${plan.targetVersion}).`,
    `El original se archivará como archive/${plan.archiveName} (con sufijo -2, -3… si ya existe).`,
  ].join("\n");

export const compactCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["accept-unverified", ...GLOBAL_FLAGS]);
  // A synced folder is a replica of the remote: compacting it is refused, and
  // so it is with its marker unreadable or missing (ADR-0026, Part A; data-
  // schema.md §5, point 6). Before anything else: nothing is planned or asked.
  const refusal = compactPermission((await folderSyncPresence(dirname(ctx.ledgerPath))).presence);
  if (refusal !== undefined) {
    throw new RefusedError(refusal);
  }
  const accepted = listFlag(flags, "accept-unverified");
  const plan = await planCompact(ctx.deps);
  if (plan.outdated === 0) {
    render(
      ctx,
      { status: "nothing_to_compact", plan },
      `Nada que compactar: las ${plan.lines} líneas están en schema_version ${plan.targetVersion}.`,
    );
    return 0;
  }
  if (!ctx.json) {
    ctx.io.out(describePlan(plan));
  }
  // What is being given up, named one by one **before** the question: the way
  // out is not a `--force`, and what it costs has to be on screen when the
  // user says yes.
  const waiving = plan.unverified.filter((entry) => accepted.includes(entry.filing_id));
  if (waiving.length > 0 && !ctx.json) {
    ctx.io.out(describeWaivers(waiving));
  }
  if (!(await confirm(ctx, "¿Compactar? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  const result = await compactLedger(ctx.deps, plan, { acceptUnverified: accepted });
  render(
    ctx,
    result,
    result.status === "compacted"
      ? [
          `Compactado: ${result.linesBefore} líneas → ${result.linesAfter} líneas en schema_version ${result.targetVersion}.`,
          `Original archivado en archive/${result.archiveName}.`,
          ...describeRecorded(result.waived),
          table(
            ["schema_version", "líneas antes"],
            result.versions.map((v) => [String(v.version), String(v.lines)]),
          ),
        ].join("\n")
      : `Nada que compactar: las ${result.lines} líneas están en schema_version ${result.targetVersion}.`,
  );
  return 0;
};
