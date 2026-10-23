// An id or an option nobody knows answers with a sentence, not with an empty table or with
// nothing at all: an empty result would read as «there is nothing there».

import { describe, expect, it } from "vitest";
import { BUY_GOLD, harness, seed } from "../harness.js";

describe("filters on an id that does not exist", () => {
  it.each([
    [["positions", "--account", "acc_nope"], "La cuenta acc_nope no existe"],
    [["positions", "--asset", "ast_nope"], "El activo ast_nope no existe"],
    [["cash", "--account", "acc_nope"], "La cuenta acc_nope no existe"],
  ])("%j says which id does not exist", async (argv, sentence) => {
    const h = harness({ events: seed() });
    expect(await h.exec(argv)).not.toBe(0);
    expect(h.text()).toContain(sentence);
  });

  it("still answers with an empty table for an account that exists and holds nothing", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["positions", "--account", "acc_etf"])).toBe(0);
    expect(await h.exec(["cash", "--account", "acc_etf"])).toBe(0);
  });
});

describe("options that mean nothing are refused", () => {
  it("draft refuses an option it does not take", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["draft", "list", "--bogus"])).toBe(64);
  });

  it("tax --boxes --lots refuses the --lots it would ignore", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["tax", "2027", "--boxes", "--lots"])).toBe(64);
    expect(h.text()).toContain("--lots");
  });
});

describe("atlas gains: what its total is", () => {
  it("says it is not the balance of the year and where that one is", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    h.reset();
    expect(await h.exec(["gains", "2027"])).toBe(0);
    expect(h.text()).toContain("atlas tax 2027");
  });
});
