// atlas rehearse --dump <fichero>: the rehearsal of a restore, by hand and on this machine
// (ADR-0032, «La prueba de que se puede restaurar»). The dump — a copy made by `atlas backup` or
// downloaded — is decoded as the loader does, projected, and compared with the ledger of the folder
// cut at the same events (`restoreRehearsal`, the same function the quarterly job runs). Read only:
// it writes nothing and reaches no server; with `--ledger` on a synthetic file it is a pure drill.

import { readFile } from "node:fs/promises";
import { CURRENT_LEDGER_SCHEMA, decodeLines, loadAndProject, todayInMadrid } from "@atlas/domain";
import { restoreRehearsal } from "@atlas/domain/jobs";
import { linesOfText } from "@atlas/domain/sync";
import { assertKnownFlags, type Flags, requireFlag } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { render, warnIfLedgerMissing } from "./shared.js";

export const rehearseCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["dump", ...GLOBAL_FLAGS]);
  const bytes = await readFile(requireFlag(flags, "dump"));
  const dump = decodeLines(
    linesOfText(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    CURRENT_LEDGER_SCHEMA,
  );
  await warnIfLedgerMissing(ctx);
  const live = await loadAndProject(ctx.deps, { collectErrors: true });
  const result = restoreRehearsal({
    dump,
    live: live.events,
    today: todayInMadrid(ctx.deps.clock),
  });
  if (result.ok) {
    render(ctx, result, `El volcado se restaura igual que el libro: ${result.events} eventos.`);
    return EXIT.ok;
  }
  render(
    ctx,
    result,
    [
      "El volcado NO coincide con el libro:",
      ...Object.entries(result.differs).map(([code, count]) => `  ${code}: ${count}`),
    ].join("\n"),
  );
  return EXIT.domain;
};
