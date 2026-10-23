// With --json, settings set, fx correct and the draft commands answer with one
// JSON object on stdout; what the person reads goes to stderr (as in json-writes).

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileEcbHistoryStore } from "@atlas/adapters";
import type { FxRateSource } from "@atlas/domain/ecb";
import { describe, expect, it } from "vitest";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";
import { ECB_FIXTURES } from "../support/fixtures.js";

const line = (fields: Record<string, unknown>, id: string): string =>
  JSON.stringify({ schema_version: 1, id, recorded_at: "2026-01-01T10:00:00.000Z", ...fields });

const catalogue = [
  line(
    {
      type: "account_created",
      account_id: "acc",
      name: "IBKR",
      platform: "ibkr",
      book: "core",
      base_currency: "EUR",
      country: "IE",
      active: true,
    },
    "01ARYZ6S41TSV4RRFFQ69G5FA0",
  ),
  line(
    {
      type: "asset_created",
      asset_id: "gold",
      asset_type: "etc",
      book: "core",
      asset_class: "gold",
      name: "Oro",
      currency: "USD",
      transferable: false,
      active: true,
    },
    "01ARYZ6S41TSV4RRFFQ69G5FA1",
  ),
];

const buy = (tradeDate: string, valueDate: string) => [
  "add",
  "buy",
  "--account",
  "acc",
  "--asset",
  "gold",
  "--trade-date",
  tradeDate,
  "--value-date",
  valueDate,
  "--quantity",
  "1",
  "--unit-price",
  "100",
  "--currency",
  "USD",
];
const ratedBuy = [
  ...buy("2026-01-02", "2026-01-06"),
  "--fx-rate",
  "1.1169",
  "--fx-rate-date",
  "2026-01-02",
  "--yes",
];
const draftBuy = buy("2026-04-01", "2026-04-03");

const laterCsv = async (): Promise<Buffer> => {
  const [header, newest, ...rest] = (
    await readFile(join(ECB_FIXTURES, "eurofxref-hist.csv"), "utf8")
  ).split("\n");
  const next = (newest as string).replace("2026-03-31,1.1091,", "2026-04-01,1.1104,");
  return Buffer.from([header, next, newest, ...rest].join("\n"));
};

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-json-rest-"));
  const ledger = join(dir, "ledger.jsonl");
  await writeFile(ledger, `${catalogue.join("\n")}\n`);
  await new FileEcbHistoryStore(dir).activate({
    source: "zip",
    bytes: await readFile(join(ECB_FIXTURES, "eurofxref-hist.csv")),
    url: "https://example.invalid/hist.zip",
    fetched_at: "2026-04-01T10:00:00.000Z",
  });
  const atlas = async (answer: boolean | undefined, argv: string[], fx?: () => FxRateSource) => {
    const out: string[] = [];
    const err: string[] = [];
    const io: Io = {
      out: (t) => out.push(t),
      err: (t) => err.push(t),
      confirm: async () => answer,
    };
    const code = await run(["--ledger", ledger, ...argv], io, { fxSource: fx });
    return { code, out, err: err.join("\n") };
  };
  const only = (out: string[]): Record<string, unknown> => {
    expect(out).toHaveLength(1);
    return JSON.parse(out[0] as string) as Record<string, unknown>;
  };
  expect((await atlas(undefined, ratedBuy)).code).toBe(0);
  return { atlas, only };
};

const RULE = ["settings", "set", "--fiscal-date-rule", "etc=value_date"];

describe("settings set --json", () => {
  it("yes: one recorded object; the warnings and the closing line go to stderr", async () => {
    const { atlas, only } = await setup();
    const result = await atlas(true, [...RULE, "--json"]);
    expect(result.code).toBe(0);
    expect(only(result.out)).toMatchObject({
      status: "recorded",
      event: { type: "settings_changed" },
    });
    expect(result.err).toContain("deja una línea con un tipo del BCE");
    expect(result.err).toContain("`atlas fx correct`");
  });

  it("no: one cancelled object", async () => {
    const { atlas, only } = await setup();
    const result = await atlas(false, [...RULE, "--json"]);
    expect(only(result.out)).toEqual({ status: "cancelled" });
    expect(result.err).toContain("Cancelado.");
  });

  it("no, to the year-moving warning: one cancelled object", async () => {
    const { atlas, only } = await setup();
    const result = await atlas(false, [
      "settings",
      "set",
      "--wash-sale-window",
      "fund=1y",
      "--json",
    ]);
    expect(only(result.out)).toEqual({ status: "cancelled" });
  });
});

describe("fx correct --json", () => {
  it("yes, no and nothing to correct each leave one object", async () => {
    const { atlas, only } = await setup();
    expect(only((await atlas(undefined, ["fx", "correct", "--json"])).out)).toEqual({
      status: "nothing_to_correct",
    });
    await atlas(undefined, [...RULE, "--yes"]);
    const no = await atlas(false, ["fx", "correct", "--json"]);
    expect(only(no.out)).toMatchObject({ status: "cancelled", corrections: 1 });
    expect(no.err).toContain("Corrección propuesta");
    const yes = await atlas(true, ["fx", "correct", "--json"]);
    expect(only(yes.out)).toMatchObject({ status: "recorded", corrections: 1 });
  });
});

describe("drafts with --json", () => {
  const idOf = (object: Record<string, unknown>) => String(object.draft_id);

  it("add --draft: one draft_saved object", async () => {
    const { atlas, only } = await setup();
    const saved = await atlas(undefined, [...draftBuy, "--draft", "--json"]);
    expect(saved.code).toBe(0);
    expect(only(saved.out)).toMatchObject({ status: "draft_saved", draft_id: expect.any(String) });
    expect(saved.err).toContain("Borrador a guardar");
  });

  it("confirm: cancelled, then recorded with the removal of the draft", async () => {
    const { atlas, only } = await setup();
    const id = idOf(only((await atlas(undefined, [...draftBuy, "--draft", "--json"])).out));
    const waiting = await atlas(undefined, ["draft", "confirm", id, "--yes", "--json"]);
    expect(waiting.code).toBe(1);
    expect(only(waiting.out)).toMatchObject({ status: "error", code: "draft_not_confirmable" });
    const bytes = await laterCsv();
    await atlas(undefined, ["fx", "update"], () => ({
      download: async () => ({
        source: "zip" as const,
        url: "https://example.invalid/h.zip",
        fetched_at: "2026-04-02T10:00:00.000Z",
        bytes,
      }),
    }));
    const no = await atlas(false, ["draft", "confirm", id, "--json"]);
    expect(only(no.out)).toEqual({ status: "cancelled" });
    const yes = await atlas(true, ["draft", "confirm", id, "--json"]);
    expect(only(yes.out)).toMatchObject({
      status: "recorded",
      event: { type: "buy" },
      draft_id: id,
      draft_removed: true,
    });
    expect(yes.err).toContain("Tipo del BCE propuesto");
  });

  it("discard: discarded or cancelled", async () => {
    const { atlas, only } = await setup();
    const id = idOf(only((await atlas(undefined, [...draftBuy, "--draft", "--json"])).out));
    expect(only((await atlas(false, ["draft", "discard", id, "--json"])).out)).toEqual({
      status: "cancelled",
    });
    expect(only((await atlas(true, ["draft", "discard", id, "--json"])).out)).toEqual({
      status: "discarded",
      draft_id: id,
    });
  });
});
