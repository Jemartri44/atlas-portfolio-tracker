// atlas backup --to <directorio> [--from-bucket --env <e>]: verified local copy
// of the ledger bytes (feature 003, decision (g)). A file operation of the CLI:
// no new port, no domain change; the copy is re-read and compared by etag and
// line count. Feature 015, E5 (ADR-0032, layer 4; §7 P5): also the local
// `documents/` beside the ledger and, with `--from-bucket`, `documents/` and
// `imports/` of the data bucket with the role of administration, only reading.

import { constants, copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileLedgerStore, HELD_FILE } from "@atlas/adapters";
import { DomainError, todayInMadrid } from "@atlas/domain";
import { parseHeld, unresolvedHeld } from "@atlas/domain/sync";
import { assertKnownFlags, booleanFlag, type Flags, requireFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { adminClientsOf, translateAwsFailure } from "./admin.js";
import { type Copied, copyBucketFolders, copyLocalDocuments } from "./backup-copies.js";
import { confirmOutsideRepository, render } from "./shared.js";
import { pathExists } from "./synth.js";

const describeCopied = (copied: Copied): string =>
  copied.written + copied.unchanged === 0
    ? "no hay nada que copiar"
    : `${copied.written} ficheros copiados y verificados, ${copied.unchanged} ya estaban iguales`;

export const backupCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["to", "from-bucket", "env", ...GLOBAL_FLAGS]);
  const directory = requireFlag(flags, "to");
  const fromBucket = booleanFlag(flags, "from-bucket");
  if (fromBucket !== flags.has("env")) {
    throw new UsageError("--from-bucket y --env van juntas: la copia del bucket es de un entorno");
  }
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
  // The documentary sources the user leaves beside the ledger, verified and
  // never overwritten; then, when asked, the bucket's, only reading.
  const documents = await copyLocalDocuments(dirname(ctx.ledgerPath), directory);
  let bucket: Copied | undefined;
  if (fromBucket) {
    try {
      bucket = await copyBucketFolders(await adminClientsOf(ctx, flags), directory);
    } catch (error) {
      throw translateAwsFailure(error);
    }
  }
  render(
    ctx,
    {
      path: destination,
      lines: copy.lines.length,
      etag: copy.etag,
      ...(held === undefined ? {} : { held }),
      documents,
      ...(bucket === undefined ? {} : { bucket }),
    },
    [
      `Copia verificada: ${destination} (${copy.lines.length} líneas, etag ${copy.etag}).`,
      held === undefined
        ? "No hay nada retenido por la sincronización: no se copia nada más."
        : `Lo retenido por la sincronización (${held.units}), aparte y verificado: ${held.path}.`,
      `documents/ de la carpeta del libro: ${describeCopied(documents)}.`,
      ...(bucket === undefined
        ? []
        : [
            `documents/ e imports/ del bucket, en ${join(directory, "bucket")}: ${describeCopied(bucket)}. En el bucket no se ha escrito ni borrado nada.`,
          ]),
    ].join("\n"),
  );
  return 0;
};
