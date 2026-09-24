// atlas fx update | status (feature 012, block 2): over real folders, with a
// double of the source — no test touches the network.

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EcbDownloadFailed } from "@atlas/adapters";
import type { DownloadedHistory, FxRateSource } from "@atlas/domain/ecb";
import { describe, expect, it } from "vitest";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/ecb");

const capture = () => {
  const lines: string[] = [];
  const io: Io = {
    out: (t) => lines.push(t),
    err: (t) => lines.push(t),
    confirm: async () => undefined,
  };
  return { io, lines, text: () => lines.join("\n") };
};

const sourceOf =
  (
    answer: () => Promise<Partial<DownloadedHistory> & { bytes: Uint8Array }>,
  ): (() => FxRateSource) =>
  () => ({
    download: async () => ({
      source: "zip",
      url: "https://example.invalid/hist.zip",
      fetched_at: "2026-09-24T10:00:00.000Z",
      ...(await answer()),
    }),
  });

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-fx-"));
  const ledger = join(dir, "ledger.jsonl");
  const csv = await readFile(join(fixtures, "eurofxref-hist.csv"));
  const atlas = (source: () => FxRateSource, ...argv: string[]) => {
    const out = capture();
    return run(["--ledger", ledger, ...argv], out.io, undefined, source).then((code) => ({
      code,
      ...out,
    }));
  };
  return { dir, ledger, csv, atlas };
};

describe("atlas fx", () => {
  it("says there is no history until one is downloaded, then says which is in force", async () => {
    const { csv, atlas, dir } = await setup();
    const none = await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "status",
    );
    expect(none.text()).toContain("No hay histórico del BCE");
    const update = await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "update",
    );
    expect(update.code).toBe(0);
    expect(update.text()).toContain(
      "actualizado desde el ZIP oficial del BCE: 127 días nuevos, hasta el 31/03/2026",
    );
    expect(await readFile(join(dir, "reference", "ecb", "eurofxref-hist.csv"))).toEqual(csv);
    const status = await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "status",
    );
    expect(status.text()).toContain("último día publicado, el 31/03/2026");
    const again = await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "update",
    );
    expect(again.text()).toContain("no hay días nuevos");
  });

  it("says when it had to use the API, and never calls it the ZIP", async () => {
    const { atlas, dir } = await setup();
    const api = await readFile(join(fixtures, "api-exr.csv"));
    const result = await atlas(
      sourceOf(async () => ({ bytes: api, source: "api", zip_failure: "HTTP 503" })),
      "fx",
      "update",
    );
    expect(result.code).toBe(0);
    expect(result.text()).toContain("El ZIP oficial no se ha podido usar (HTTP 503)");
    expect(result.text()).toContain("desde la API de datos del BCE");
    expect(await readFile(join(dir, "reference", "ecb", "api-exr.csv"))).toEqual(api);
  });

  it("keeps apart a history that changes a published rate, and says it", async () => {
    const { csv, atlas } = await setup();
    await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "update",
    );
    const changed = Buffer.from(csv.toString("utf8").replace(",0.8595,", ",0.8596,"));
    const result = await atlas(
      sourceOf(async () => ({ bytes: changed, fetched_at: "2026-09-25T10:00:00.000Z" })),
      "fx",
      "update",
    );
    expect(result.code).toBe(1);
    expect(result.text()).toContain("Hallazgo: el histórico descargado no coincide");
    expect(result.text()).toContain(
      "GBP del 05/01/2026: 0.8595 en el que está en vigor, 0.8596 en el descargado",
    );
    expect(result.text()).toContain("sigue en vigor reference/ecb/eurofxref-hist.csv");
    const status = await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "status",
    );
    expect(status.text()).toContain("1 descarga guardada aparte");
  });

  it("warns, and still stores, where the calendar disagrees in the years of the ledger", async () => {
    const { csv, atlas, ledger } = await setup();
    await writeFile(
      ledger,
      `${JSON.stringify({ schema_version: 1, id: "01ARYZ6S41TSV4RRFFQ69G5FA0", recorded_at: "2026-01-02T10:00:00.000Z", type: "account_created", account_id: "acc", name: "A", platform: "p", book: "core", base_currency: "EUR", country: "ES", active: true })}\n${JSON.stringify({ schema_version: 1, id: "01ARYZ6S41TSV4RRFFQ69G5FA1", recorded_at: "2026-01-02T10:00:00.000Z", type: "cash_deposit", account_id: "acc", value_date: "2026-01-02", amount: "1", currency: "USD", fx_rate: "1.1", fx_rate_date: "2026-01-02", fingerprint: "sha256:x" })}\n`,
    );
    const missing = Buffer.from(csv.toString("utf8").replace(/^2026-01-05.*\n/m, ""));
    const result = await atlas(
      sourceOf(async () => ({ bytes: missing })),
      "fx",
      "update",
    );
    expect(result.code).toBe(0);
    expect(result.text()).toContain(
      "Aviso: el calendario TARGET y el histórico no coinciden en 1 día",
    );
    expect(result.text()).toContain("05/01/2026: día hábil sin publicación");
  });

  it("touches nothing when the download fails or is not a history, and says why", async () => {
    const { csv, atlas, dir } = await setup();
    await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "update",
    );
    const failed = await atlas(
      () => ({ download: () => Promise.reject(new EcbDownloadFailed("sin red", "HTTP 500")) }),
      "fx",
      "update",
    );
    expect(failed.code).toBe(1);
    expect(failed.text()).toContain(
      "El ZIP: sin red. La API: HTTP 500. No se ha tocado el histórico que había.",
    );
    const garbage = await atlas(
      sourceOf(async () => ({ bytes: Buffer.from("<html>no</html>") })),
      "fx",
      "update",
    );
    expect(garbage.code).toBe(1);
    expect(garbage.text()).toContain("El histórico del BCE no tiene el formato esperado");
    expect(await readFile(join(dir, "reference", "ecb", "eurofxref-hist.csv"))).toEqual(csv);
  });

  it("refuses a stored history someone changed, and an unknown subcommand", async () => {
    const { csv, atlas, dir } = await setup();
    await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "update",
    );
    await writeFile(join(dir, "reference", "ecb", "eurofxref-hist.csv"), "editado");
    const damaged = await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "status",
    );
    expect(damaged.code).toBe(1);
    expect(damaged.text()).toContain("no es el archivo que registra su manifiesto");
    const wrong = await atlas(
      sourceOf(async () => ({ bytes: csv })),
      "fx",
      "download",
    );
    expect(wrong.code).toBe(64);
  });
});
