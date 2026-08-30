// atlas backup --to <directorio>: verified local copy of the ledger bytes
// (feature 003, decision (g)). A file operation of the CLI: no new port, no
// domain change; the copy is re-read and compared by etag and line count.

import { constants, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { FileLedgerStore } from "@atlas/adapters";
import { DomainError, todayInMadrid } from "@atlas/domain";
import { assertKnownFlags, type Flags, requireFlag } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { render } from "./shared.js";
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
  render(
    ctx,
    { path: destination, lines: copy.lines.length, etag: copy.etag },
    `Copia verificada: ${destination} (${copy.lines.length} líneas, etag ${copy.etag}).`,
  );
  return 0;
};
