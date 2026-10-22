// atlas export --format jsonl|csv [--out <ruta>]: the whole ledger, reversed events included.

import { lstat, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  DomainError,
  decodeLines,
  encodeLine,
  type LedgerEvent,
  projectLedger,
} from "@atlas/domain";
import { linesOfText } from "@atlas/domain/sync";
import { assertKnownFlags, type Flags, stringFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { cloudStoreOf } from "../folder-mode.js";
import { pathExists } from "../fs.js";
import { assertNoLedgerInCloudFolder } from "../remote/credentials-file.js";
import { confirm, confirmOutsideRepository, degradedHeader, loadForQuery } from "./shared.js";

/**
 * Free text that a spreadsheet would run as a formula (`notes` of a movement
 * starting with `=`, `+`, `-`, `@`, a tab or a return) gets a leading `'`. A
 * plain number —the signed amounts the ledger holds as strings— is not a
 * formula and stays as it is. The ledger itself is never touched.
 */
const defused = (text: string): string =>
  /^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;

const csvCell = (value: unknown): string => {
  if (value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? defused(value) : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * Whether `file` is an entry of the ledger folder (credentials, sync state,
 * config, backups): the entry itself, even a link pointing elsewhere or a
 * dangling one, or whatever it resolves to. `rename` replaces the entry.
 */
const inLedgerFolder = async (file: string, ledgerPath: string): Promise<boolean> => {
  const inside = (folder: string, target: string): boolean => {
    const path = relative(folder, target);
    return path !== "" && !path.startsWith("..") && !isAbsolute(path);
  };
  try {
    const folder = await realpath(dirname(ledgerPath));
    const entry = join(await realpath(dirname(resolve(file))), basename(file));
    if (
      inside(folder, entry) &&
      (await lstat(entry).then(
        () => true,
        () => false,
      ))
    ) {
      return true;
    }
    return inside(folder, await realpath(file));
  } catch {
    return false;
  }
};

export const toCsv = (rows: readonly Record<string, unknown>[]): string => {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n");
};

/** Whether both paths are the same file (a symlink or a hard link to the ledger included). */
const sameFile = async (a: string, b: string): Promise<boolean> => {
  try {
    const [left, right] = await Promise.all([stat(a), stat(b)]);
    return left.dev === right.dev && left.ino === right.ino;
  } catch {
    return false;
  }
};

const cloudProjection = (events: LedgerEvent[]) => ({
  events,
  state: projectLedger(events, { collectErrors: true }),
});

export const exportCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["format", "out", ...GLOBAL_FLAGS]);
  const format = stringFlag(flags, "format") ?? "jsonl";
  const out = stringFlag(flags, "out");
  if (format !== "jsonl" && format !== "csv") {
    throw new UsageError("uso: atlas export --format jsonl|csv [--out <ruta>]");
  }
  // In a cloud folder the ledger is the cloud's, once and with its own bytes.
  const cloud = cloudStoreOf(ctx);
  const snapshot = cloud === undefined ? undefined : await (await cloud.remote()).read();
  const { events, state } =
    snapshot === undefined
      ? await loadForQuery(ctx)
      : cloudProjection(decodeLines(linesOfText(snapshot.text), ctx.deps.store.schema));
  let content: string;
  if (format === "jsonl") {
    content =
      snapshot?.text ??
      (await readFile(ctx.ledgerPath, "utf8").catch(
        () => `${events.map((event) => encodeLine(event)).join("\n")}\n`,
      ));
  } else {
    content = `${toCsv(events as unknown as Record<string, unknown>[])}\n`;
  }
  // The header never travels with the data: it would corrupt the file and the pipe.
  const header = degradedHeader(state);
  if (header !== undefined) {
    ctx.io.err(header);
  }
  if (out !== undefined) {
    await assertNoLedgerInCloudFolder(out);
  }
  if (out === undefined) {
    ctx.io.out(content.endsWith("\n") ? content.slice(0, -1) : content);
    return 0;
  }
  const exists = await pathExists(out);
  // Before any question: this one has no «yes».
  if (exists && (await sameFile(out, ctx.ledgerPath))) {
    throw new DomainError("export_over_ledger", `${out} is the ledger`, { path: out });
  }
  if (exists && (await inLedgerFolder(out, ctx.ledgerPath))) {
    throw new DomainError("export_in_ledger_folder", `${out} is a file of the ledger folder`, {
      path: out,
    });
  }
  if (exists && (await stat(out)).isDirectory()) {
    throw new DomainError("path_exists", `${out} is a directory`, { path: out });
  }
  if (!(await confirmOutsideRepository(ctx, out))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  if (exists) {
    ctx.io.out(`${out} ya existe y se sustituiría.`);
    if (!(await confirm(ctx, "¿Sobrescribir? [s/N] "))) {
      ctx.io.out("Cancelado.");
      return 0;
    }
  }
  // Whole or not at all: a cut leaves the previous file, never half of the new one.
  const temporary = `${out}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
    await rename(temporary, out);
  } catch (failure) {
    await rm(temporary, { force: true });
    throw failure;
  }
  ctx.io.out(`Exportado a ${out}.`);
  return 0;
};
