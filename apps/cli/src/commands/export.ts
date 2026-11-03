// atlas export --format jsonl|csv [--out <ruta>]: the whole ledger, reversed events included.

import { lstat, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { FileLedgerStore } from "@atlas/adapters";
import { DomainError, encodeLine } from "@atlas/domain";
import { assertKnownFlags, booleanFlag, type Flags, stringFlag, UsageError } from "../args.js";
import { CommandFailure, type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { pathExists } from "../fs.js";
import {
  aside,
  cancelled,
  confirm,
  confirmOutsideRepository,
  degradedHeader,
  IN_REPOSITORY_FLAG,
  loadForQuery,
  render,
} from "./shared.js";

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

export const exportCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["format", "out", IN_REPOSITORY_FLAG, ...GLOBAL_FLAGS]);
  const format = stringFlag(flags, "format") ?? "jsonl";
  const out = stringFlag(flags, "out");
  if (format !== "jsonl" && format !== "csv") {
    throw new UsageError("uso: atlas export --format jsonl|csv [--out <ruta>]");
  }
  const { events, state } = await loadForQuery(ctx);
  // A mistyped `--ledger` reads as an empty ledger, which is right for a view; as a file written
  // with `--out` it would be an empty export that looks like a backup.
  if (
    out !== undefined &&
    ctx.deps.store instanceof FileLedgerStore &&
    !(await pathExists(ctx.ledgerPath))
  ) {
    throw new CommandFailure(EXIT.domain, "export_no_ledger", [
      `Error: no existe el libro ${ctx.ledgerPath}: no hay nada que exportar. Indica el libro con --ledger <ruta>.`,
    ]);
  }
  let content: string;
  if (format === "jsonl") {
    content = await readFile(ctx.ledgerPath, "utf8").catch(
      () => `${events.map((event) => encodeLine(event)).join("\n")}\n`,
    );
  } else {
    content = `${toCsv(events as unknown as Record<string, unknown>[])}\n`;
  }
  // The header never travels with the data: it would corrupt the file and the pipe.
  const header = degradedHeader(state);
  if (header !== undefined) {
    ctx.io.err(header);
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
  if (!(await confirmOutsideRepository(ctx, out, booleanFlag(flags, IN_REPOSITORY_FLAG)))) {
    cancelled(ctx);
    return 0;
  }
  if (exists) {
    aside(ctx, `${out} ya existe y se sustituiría.`);
    if (!(await confirm(ctx, "¿Sobrescribir? [s/N] "))) {
      cancelled(ctx);
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
  render(ctx, { status: "exported", format, path: out }, `Exportado a ${out}.`);
  return 0;
};
