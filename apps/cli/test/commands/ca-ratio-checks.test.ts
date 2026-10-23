// A split with the ratio upside down books every lot wrong, silently: the console refuses it and says
// how to write it. `ratio` is new/old (data-schema.md §6.5).

import { describe, expect, it } from "vitest";
import { harness, seed } from "../harness.js";

const CA = [
  "--effective-date",
  "2027-03-01",
  "--source-document",
  "https://issuer.example/notice.pdf",
  "--yes",
];

const ca = (kind: string, ...rest: string[]) => ["ca", kind, "--asset", "ast_gold", ...rest, ...CA];

const CASH = ["--currency", "USD", "--fx-rate", "1", "--fx-rate-date", "2027-03-01"];

describe("atlas ca: the direction of the ratio", () => {
  it.each([
    ["split", "1/4", "mayor que 1"],
    ["split", "0.5", "ca reverse-split --ratio 0.5"],
    ["split", "1", "no cambia"],
    ["reverse-split", "4", "menor que 1"],
    ["reverse-split", "2/1", "ca split --ratio 2/1"],
    ["reverse-split", "1", "no cambia"],
  ])("%s with --ratio %s is refused, and says how to write it", async (kind, ratio, hint) => {
    const h = harness({ events: seed() });
    expect(await h.exec(ca(kind, "--ratio", ratio))).toBe(64);
    expect(h.text()).toContain(hint);
    expect((await h.store.load()).events).toHaveLength(seed().length);
  });

  it.each([
    ["split", "4"],
    ["split", "3/2"],
    ["split", "1.5"],
    ["reverse-split", "1/4"],
    ["reverse-split", "0.25"],
    ["reverse-split", "2/3"],
  ])("%s with --ratio %s goes through", async (kind, ratio) => {
    const h = harness({ events: seed() });
    expect(await h.exec(ca(kind, "--ratio", ratio))).toBe(0);
  });

  it("leaves a ratio that is no ratio at all to the domain's own message", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(ca("split", "--ratio", "abc"))).not.toBe(0);
    expect(h.text()).toContain("ratio");
  });
});

describe("atlas ca reverse-split: the cash options need the price", () => {
  it.each([
    ["--currency", "USD"],
    ["--fx-rate", "1"],
    ["--fx-rate-date", "2027-03-01"],
    ["--fees", "acc_etf=1"],
    ["--withholdings", "acc_etf=1"],
  ])("%s without --cash-per-share is refused, not ignored", async (flag, value) => {
    const h = harness({ events: seed() });
    expect(await h.exec(ca("reverse-split", "--ratio", "1/4", flag, value))).toBe(64);
    expect(h.text()).toContain("--cash-per-share");
    expect((await h.store.load()).events).toHaveLength(seed().length);
  });

  it("goes through with the price", async () => {
    const h = harness({ events: seed() });
    expect(
      await h.exec(ca("reverse-split", "--ratio", "1/4", "--cash-per-share", "400", ...CASH)),
    ).toBe(0);
  });
});
