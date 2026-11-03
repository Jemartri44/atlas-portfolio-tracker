// atlas backup --to <directorio> [--from-bucket --env <e>]: verified local copy
// of the ledger bytes. A file operation of the CLI:
// no new port, no domain change; the copy is re-read and compared by etag and
// line count. Also (ADR-0032, layer 4) the local
// `documents/` beside the ledger. With `--from-bucket`, everything comes from the
// data bucket instead, with the role of administration and only reading: the
// ledger of the cloud (ADR-0035: the only one there is) and its `documents/` and
// `imports/`, and the exposure the owner declares. Every copy is written dated, never over another, read-only for its
// owner (`0400`), and read back to verify it.

import { chmod, constants, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileLedgerStore } from "@atlas/adapters";
import { DomainError, todayInMadrid } from "@atlas/domain";
import { linesOfText } from "@atlas/domain/sync";
import { adminClientsOf, translateAwsFailure } from "../admin/clients.js";
import type { AdminClients } from "../admin/environment.js";
import { assertKnownFlags, booleanFlag, type Flags, requireFlag, UsageError } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { isFile, pathExists, sha256 } from "../fs.js";
import {
  type Copied,
  type CopiedFromBucket,
  copyBucketFolders,
  copyLocalDocuments,
} from "./backup-copies.js";
import { cancelled, confirmOutsideRepository, IN_REPOSITORY_FLAG, render } from "./shared.js";

const LEDGER_KEY = "ledger/ledger.jsonl";

const describeCopied = (copied: Copied): string =>
  copied.written + copied.unchanged === 0
    ? "no hay nada que copiar"
    : `${copied.written} ficheros copiados y verificados, ${copied.unchanged} ya estaban iguales`;

/**
 * The ledger of the bucket, as its bytes are: written **dated and never over another** (`wx`) and
 * left read-only for its owner alone (`400`), so nobody writes in it by mistake and a second ledger
 * is born; read back and compared by SHA-256 with what came down.
 */
const copyFromBucket = async (
  clients: AdminClients,
  destination: string,
): Promise<{ etag: string; lines: readonly string[] }> => {
  const stored = await clients.objects.get(LEDGER_KEY);
  if (stored === undefined) {
    throw new DomainError("ledger_missing", "there is no ledger in the bucket", {
      path: LEDGER_KEY,
    });
  }
  const etag = sha256(stored.body);
  await writeFile(destination, stored.body, { flag: "wx", mode: 0o400 });
  try {
    await chmod(destination, 0o400);
    const written = await readFile(destination);
    if (sha256(written) !== etag) {
      throw new DomainError("backup_mismatch", "the copy does not match the bucket's ledger", {
        path: destination,
        etag: sha256(written),
        expected_etag: etag,
      });
    }
  } catch (failure) {
    // Same as the local copy: a bad file would block the retry of the day.
    await rm(destination, { force: true });
    throw failure;
  }
  return { etag, lines: linesOfText(Buffer.from(stored.body).toString("utf8")) };
};

export const backupCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["to", "from-bucket", "env", IN_REPOSITORY_FLAG, ...GLOBAL_FLAGS]);
  const directory = requireFlag(flags, "to");
  const fromBucket = booleanFlag(flags, "from-bucket");
  if (fromBucket !== flags.has("env")) {
    throw new UsageError("--from-bucket y --env van juntas: la copia del bucket es de un entorno");
  }
  if (!fromBucket && !(await pathExists(ctx.ledgerPath))) {
    throw new DomainError("ledger_missing", `there is no ledger at ${ctx.ledgerPath}`, {
      path: ctx.ledgerPath,
    });
  }
  if (await isFile(directory)) {
    throw new DomainError("not_a_directory", `${directory} is not a directory`, {
      path: directory,
    });
  }
  const destination = join(directory, `ledger-${todayInMadrid(ctx.deps.clock)}.jsonl`);
  if (await pathExists(destination)) {
    throw new DomainError("path_exists", `${destination} already exists`, { path: destination });
  }
  if (!(await confirmOutsideRepository(ctx, destination, booleanFlag(flags, IN_REPOSITORY_FLAG)))) {
    cancelled(ctx);
    return 0;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let copy: { etag: string; lines: readonly string[] };
  let bucket: CopiedFromBucket | undefined;
  if (!fromBucket) {
    await copyFile(ctx.ledgerPath, destination, constants.COPYFILE_EXCL);
    await chmod(destination, 0o400);
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
    try {
      const clients = await adminClientsOf(ctx, flags);
      copy = await copyFromBucket(clients, destination);
      bucket = await copyBucketFolders(clients, directory);
    } catch (error) {
      throw translateAwsFailure(error);
    }
  }
  // The documentary sources the user leaves beside the ledger, verified and never overwritten. The
  // copy of the bucket has its own: the folder beside `--ledger` is not its.
  const documents = fromBucket
    ? undefined
    : await copyLocalDocuments(dirname(ctx.ledgerPath), directory);
  render(
    ctx,
    {
      path: destination,
      lines: copy.lines.length,
      etag: copy.etag,
      ...(documents === undefined ? {} : { documents }),
      ...(bucket === undefined ? {} : { bucket }),
    },
    [
      `Copia verificada: ${destination} (${copy.lines.length} líneas, etag ${copy.etag}).`,
      ...(fromBucket
        ? [
            "Es el libro de la nube, de solo lectura (0400). Para trabajar con él en una carpeta, «atlas admin pull».",
          ]
        : []),
      ...(documents === undefined
        ? []
        : [`documents/ de la carpeta del libro: ${describeCopied(documents)}.`]),
      ...(bucket === undefined
        ? []
        : [
            `documents/, imports/ y la exposición (settings/exposure.json) del bucket, en ${join(directory, "bucket")}: ${describeCopied(bucket)}. En el bucket no se ha escrito ni borrado nada.`,
          ]),
    ].join("\n"),
  );
  if (documents !== undefined && documents.skipped.length > 0) {
    ctx.io.err(
      `Error (documents_not_copied): estos ficheros de documents/ no son ficheros normales (enlaces u otros) y no se han copiado; el resto, sí: ${documents.skipped.join(", ")}.`,
    );
    return EXIT.domain;
  }
  if (bucket !== undefined && bucket.skipped.length > 0) {
    ctx.io.err(
      `Error (bucket_key_unsafe): estas claves del bucket no son una ruta sencilla y no se han copiado; el resto, sí: ${bucket.skipped.join(", ")}.`,
    );
    return EXIT.domain;
  }
  return 0;
};
