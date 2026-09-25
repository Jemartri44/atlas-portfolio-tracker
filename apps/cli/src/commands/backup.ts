// atlas backup --to <directorio>: verified local copy of the ledger bytes
// (feature 003, decision (g)). A file operation of the CLI: no new port, no
// domain change; the copy is re-read and compared by etag and line count.

import { constants, copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileLedgerStore, HELD_FILE } from "@atlas/adapters";
import { DomainError, todayInMadrid } from "@atlas/domain";
import { parseHeld, unresolvedHeld } from "@atlas/domain/sync";
import { assertKnownFlags, type Flags, requireFlag } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { confirmOutsideRepository, render } from "./shared.js";
import { pathExists } from "./synth.js";

export const backupCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["to", ...GLOBAL_FLAGS]);
  const directory = requireFlag(flags, "to");
  if (!(await pathExists(ctx.ledgerPath))) {
    throw new DomainError("ledger_missing", `there is no ledger at ${ctx.ledgerPath}`, {
      path: ctx.ledgerPath,
    });
  }
  const destination = join(directory, `ledger-${todayInMadrid(ctx.deps.clock)}.jsonl`);
  if (await pathExists(destination)) {
    throw new DomainError("path_exists", `${destination} already exists`, { path: destination });
  }
  if (!(await confirmOutsideRepository(ctx, destination))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  await mkdir(directory, { recursive: true });
  await copyFile(ctx.ledgerPath, destination, constants.COPYFILE_EXCL);
  const original = await new FileLedgerStore(ctx.ledgerPath, ctx.deps.store.schema).load();
  const copy = await new FileLedgerStore(destination, ctx.deps.store.schema).load();
  if (copy.etag !== original.etag || copy.lines.length !== original.lines.length) {
    throw new DomainError("backup_mismatch", "the copy does not match the ledger", {
      path: destination,
      etag: copy.etag,
      expected_etag: original.etag,
      lines: copy.lines.length,
      expected_lines: original.lines.length,
    });
  }
  // What the sync holds back, apart and named as such (§6.2 P3, D-Q13): the
  // whole file with its history, verified as the ledger is; never written
  // when nothing is held back unresolved, and said.
  const heldSource = join(dirname(ctx.ledgerPath), HELD_FILE);
  const heldText = await readFile(heldSource, "utf8").catch(() => undefined);
  let held: { path: string; units: number } | undefined;
  if (heldText !== undefined && unresolvedHeld(parseHeld(heldText)).length > 0) {
    const heldDestination = join(directory, `ledger-${todayInMadrid(ctx.deps.clock)}.held.jsonl`);
    await copyFile(heldSource, heldDestination, constants.COPYFILE_EXCL);
    if ((await readFile(heldDestination, "utf8")) !== heldText) {
      throw new DomainError("backup_mismatch", "the copy does not match what is held back", {
        path: heldDestination,
      });
    }
    held = { path: heldDestination, units: unresolvedHeld(parseHeld(heldText)).length };
  }
  render(
    ctx,
    {
      path: destination,
      lines: copy.lines.length,
      etag: copy.etag,
      ...(held === undefined ? {} : { held }),
    },
    [
      `Copia verificada: ${destination} (${copy.lines.length} líneas, etag ${copy.etag}).`,
      held === undefined
        ? "No hay nada retenido por la sincronización: no se copia nada más."
        : `Lo retenido por la sincronización (${held.units}), aparte y verificado: ${held.path}.`,
    ].join("\n"),
  );
  return 0;
};
