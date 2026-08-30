// atlas compact [--yes]: plan → show lines per version and the archive name →
// confirm → rewrite (the store archives the original bytes first).

import { type CompactPlan, compactLedger, planCompact } from "@atlas/domain";
import { assertKnownFlags, type Flags } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { confirm, render } from "./shared.js";

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
  assertKnownFlags(flags, GLOBAL_FLAGS);
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
  if (!(await confirm(ctx, "¿Compactar? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  const result = await compactLedger(ctx.deps, plan);
  render(
    ctx,
    result,
    result.status === "compacted"
      ? [
          `Compactado: ${result.linesBefore} líneas → ${result.linesAfter} líneas en schema_version ${result.targetVersion}.`,
          `Original archivado en archive/${result.archiveName}.`,
          table(
            ["schema_version", "líneas antes"],
            result.versions.map((v) => [String(v.version), String(v.lines)]),
          ),
        ].join("\n")
      : `Nada que compactar: las ${result.lines} líneas están en schema_version ${result.targetVersion}.`,
  );
  return 0;
};
