// atlas export --format jsonl|csv [--out <ruta>]: the whole ledger, reversed events included.

import { readFile, rename, stat, writeFile } from "node:fs/promises";
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

const csvCell = (value: unknown): string => {
  if (value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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
  if (!(await confirmOutsideRepository(ctx, out))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  if (await pathExists(out)) {
    if (await sameFile(out, ctx.ledgerPath)) {
      throw new DomainError("path_exists", `${out} is the ledger`, { path: out });
    }
    ctx.io.out(`${out} ya existe y se sustituiría.`);
    if (!(await confirm(ctx, "¿Sobrescribir? [s/N] "))) {
      ctx.io.out("Cancelado.");
      return 0;
    }
  }
  // Whole or not at all: a cut leaves the previous file, never half of the new one.
  const temporary = `${out}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, out);
  ctx.io.out(`Exportado a ${out}.`);
  return 0;
};
