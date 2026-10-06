// «Descargar copia» (ADR-0035, §4): the ledger of the cloud, handed to the
// person as a file. **Only a download**: nothing is kept on the device and no
// date is remembered. The JSONL is the text of the ledger byte for byte (the
// file the console reads and the one the web hands over are the same bytes);
// the CSV is the same table `atlas export --format csv` writes.

import { requireDeps } from "./state.js";

export type CopyFormat = "jsonl" | "csv";

const csvCell = (value: unknown): string => {
  if (value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** The events as a CSV: one column per field that appears in any of them, in order of appearance. */
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

/** Reads the ledger from the cloud now (never from the screen's copy) and returns the file's text. */
export const copyText = async (format: CopyFormat): Promise<string> => {
  const { events, lines } = await requireDeps().store.load();
  return format === "jsonl"
    ? `${lines.join("\n")}\n`
    : `${toCsv(events as unknown as Record<string, unknown>[])}\n`;
};

/** The name of the file, with the day: copies are never overwritten by the browser's own rename. */
export const copyName = (format: CopyFormat, day: string): string => `atlas-copia-${day}.${format}`;

const download = (text: string, name: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

/** Downloads the copy; returns its name. */
export const downloadCopy = async (format: CopyFormat, day: string): Promise<string> => {
  const text = await copyText(format);
  const name = copyName(format, day);
  download(text, name, format === "jsonl" ? "application/x-ndjson" : "text/csv");
  return name;
};
