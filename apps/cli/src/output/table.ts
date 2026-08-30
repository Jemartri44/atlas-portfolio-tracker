// Plain-text tables, aligned by column; numbers are not reformatted.

export const table = (headers: readonly string[], rows: readonly (readonly string[])[]): string => {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] as number))
      .join("  ")
      .trimEnd();
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  return [line(headers), separator, ...rows.map(line)].join("\n");
};

export const keyValue = (record: Record<string, unknown>): string =>
  table(
    ["campo", "valor"],
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
