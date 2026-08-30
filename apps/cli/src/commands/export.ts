// atlas export --format jsonl|csv [--out <ruta>]: the whole ledger, reversed events included.

import { readFile, writeFile } from "node:fs/promises";
import { encodeLine, loadAndProject } from "@atlas/domain";
import { assertKnownFlags, type Flags, stringFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";

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
  let content: string;
  if (format === "jsonl") {
    content = await readFile(ctx.ledgerPath, "utf8").catch(async () => {
      const { events } = await loadAndProject(ctx.deps);
      return events.map((event) => `${encodeLine(event)}\n`).join("");
    });
  } else if (format === "csv") {
    const { events } = await loadAndProject(ctx.deps);
    content = `${toCsv(events as unknown as Record<string, unknown>[])}\n`;
  } else {
    throw new UsageError("uso: atlas export --format jsonl|csv [--out <ruta>]");
  }
  if (out === undefined) {
    ctx.io.out(content.endsWith("\n") ? content.slice(0, -1) : content);
  } else {
    await writeFile(out, content);
    ctx.io.out(`Exportado a ${out}.`);
  }
  return 0;
};
