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

/**
 * How much JSON a single field may print before it stops being readable.
 *
 * `tax_return_filed` carries the **whole resolved configuration** inside
 * `computed`, because reproducing the calculation of that day needs it
 * (ADR-0022). Printed whole it was about 1.900 characters of one cell, right
 * before the question "¿Registrar? [s/N]": a confirmation nobody can read is
 * a confirmation nobody reads.
 */
const WIDE = 160;

/**
 * What a field holds, when it holds too much to print: the names of what is
 * inside and how big it is. It does **not** pretend to show it — it says what
 * is there and that all of it is written.
 */
const summary = (value: unknown, json: string): string => {
  const size = `${json.length} caracteres`;
  if (Array.isArray(value)) {
    return `[${value.length} elementos] — ${size}, se guarda entero`;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  return `{${keys.join(", ")}} — ${size}, se guarda entero`;
};

export const keyValue = (record: Record<string, unknown>): string =>
  table(
    ["campo", "valor"],
    Object.entries(record).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value];
      }
      const json = JSON.stringify(value);
      return [
        key,
        json.length > WIDE && typeof value === "object" && value !== null
          ? summary(value, json)
          : json,
      ];
    }),
  );
