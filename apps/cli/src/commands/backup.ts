// atlas backup --to <directorio> [--from-bucket --env <e>]: verified local copy
// of the ledger bytes. A file operation of the CLI:
// no new port, no domain change; the copy is re-read and compared by etag and
// line count. Also (ADR-0032, layer 4) the local
// `documents/` beside the ledger and, with `--from-bucket`, `documents/` and
// `imports/` of the data bucket with the role of administration, only reading.
// In a cloud folder (ADR-0035, §4) the ledger comes down by the API
// with the device token, is checked against its etag, and is written dated,
// never over another, read-only (`0444`).

import { chmod, constants, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileLedgerStore } from "@atlas/adapters";
import { DomainError, todayInMadrid } from "@atlas/domain";
import { linesOfText } from "@atlas/domain/sync";
import { adminClientsOf, translateAwsFailure } from "../admin/clients.js";
import { assertKnownFlags, booleanFlag, type Flags, requireFlag, UsageError } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { cloudStoreOf } from "../folder-mode.js";
import { pathExists, sha256 } from "../fs.js";
import {
  type Copied,
  type CopiedFromBucket,
  copyBucketFolders,
  copyLocalDocuments,
} from "./backup-copies.js";
import { confirmOutsideRepository, render } from "./shared.js";

const describeCopied = (copied: Copied): string =>
  copied.written + copied.unchanged === 0
    ? "no hay nada que copiar"
    : `${copied.written} ficheros copiados y verificados, ${copied.unchanged} ya estaban iguales`;

/**
 * The ledger of the cloud, down by the API: the SHA-256 of the bytes has to be
 * its etag (`httpRemote` already says so on the way; said again here, over what
 * is on the disk), written **dated and never over another** (`wx`) and left
 * read-only, so nobody writes in it by mistake and a second ledger is born.
 */
const copyFromCloud = async (
  remote: { read(): Promise<{ text: string; etag: string }> },
  destination: string,
): Promise<{ etag: string; lines: readonly string[] }> => {
  const snapshot = await remote.read();
  const bytes = Buffer.from(snapshot.text, "utf8");
  const mismatch = (found: string): DomainError =>
    new DomainError("backup_mismatch", "the copy does not match the cloud's ledger", {
      path: destination,
      etag: found,
      expected_etag: snapshot.etag,
    });
  if (sha256(bytes) !== snapshot.etag) {
    throw mismatch(sha256(bytes));
  }
  await writeFile(destination, bytes, { flag: "wx", mode: 0o444 });
  try {
    await chmod(destination, 0o444);
    const written = await readFile(destination);
    if (sha256(written) !== snapshot.etag) {
      throw mismatch(sha256(written));
    }
  } catch (failure) {
    // Same as the local copy: a bad file would block the retry of the day.
    await rm(destination, { force: true });
    throw failure;
  }
  return { etag: snapshot.etag, lines: linesOfText(snapshot.text) };
};

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
  const cloud = cloudStoreOf(ctx);
  if (cloud === undefined && !(await pathExists(ctx.ledgerPath))) {
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
  let copy: { etag: string; lines: readonly string[] };
  if (cloud === undefined) {
    await copyFile(ctx.ledgerPath, destination, constants.COPYFILE_EXCL);
    try {
      const original = await new FileLedgerStore(ctx.ledgerPath, ctx.deps.store.schema).load();
      copy = await new FileLedgerStore(destination, ctx.deps.store.schema).load();
      if (copy.etag !== original.etag || copy.lines.length !== original.lines.length) {
        throw new DomainError("backup_mismatch", "the copy does not match the ledger", {
          path: destination,
          etag: copy.etag,
          expected_etag: original.etag,
          lines: copy.lines.length,
          expected_lines: original.lines.length,
        });
      }
    } catch (failure) {
      // A bad copy left behind would make `path_exists` refuse the retry of the day.
      await rm(destination, { force: true });
      throw failure;
    }
  } else {
    copy = await copyFromCloud(await cloud.remote(), destination);
  }
  // The documentary sources the user leaves beside the ledger, verified and
  // never overwritten; then, when asked, the bucket's, only reading.
  const documents = await copyLocalDocuments(dirname(ctx.ledgerPath), directory);
  let bucket: CopiedFromBucket | undefined;
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
      documents,
      ...(bucket === undefined ? {} : { bucket }),
    },
    [
      `Copia verificada: ${destination} (${copy.lines.length} líneas, etag ${copy.etag}).`,
      ...(cloud === undefined
        ? []
        : [
            "La copia es de solo lectura (0444): si la quieres como libro local, copia el fichero a otra carpeta.",
          ]),
      `documents/ de la carpeta del libro: ${describeCopied(documents)}.`,
      ...(bucket === undefined
        ? []
        : [
            `documents/ e imports/ del bucket, en ${join(directory, "bucket")}: ${describeCopied(bucket)}. En el bucket no se ha escrito ni borrado nada.`,
          ]),
    ].join("\n"),
  );
  if (bucket !== undefined && bucket.skipped.length > 0) {
    ctx.io.err(
      `Error (bucket_key_unsafe): estas claves del bucket no son una ruta sencilla y no se han copiado; el resto, sí: ${bucket.skipped.join(", ")}.`,
    );
    return EXIT.domain;
  }
  return 0;
};
