// atlas export --format jsonl|csv [--out <ruta>]: the whole ledger, reversed events included.

import { readFile, writeFile } from "node:fs/promises";
import { encodeLine } from "@atlas/domain";
import { assertKnownFlags, type Flags, stringFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { confirmOutsideRepository, degradedHeader, loadForQuery } from "./shared.js";

const csvCell = (value: unknown): string => {
  if (value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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
  const { events, state } = await loadForQuery(ctx);
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
  if (!(await confirmOutsideRepository(ctx, out))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  await writeFile(out, content);
  ctx.io.out(`Exportado a ${out}.`);
  return 0;
};
