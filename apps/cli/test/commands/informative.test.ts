// atlas m720 <año> · atlas m721 <año>: the informative returns as JSON. The verdict is the
// domain's (packages/domain/test/informative); here, that the console prints the field the web
// reads it from, and refuses what it must.

import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { harness } from "../harness.js";

/** Securities abroad worth 60.000,00 at 31/12/2027, and one Spanish account. */
const abroad = (): Events => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  b.account("acc_es");
  b.asset("etf_a", "etf");
  b.deposit("acc_ib", "2027-01-04", "10100");
  b.deposit("acc_es", "2027-01-04", "90000");
  b.buy("acc_ib", "etf_a", "2027-01-05", "100", "100");
  b.valuation("acc_ib", "etf_a", "2027-12-31", "100", "600");
  return b;
};

interface Report {
  model: string;
  categories: { category: string; verdict: string; value_eur: { amount: string } }[];
  excluded: { account_id: string }[];
  notes: unknown[];
}

const run = async (argv: string[], events = abroad().build()): Promise<Report> => {
  const h = harness({ events, instant: "2028-03-01T10:00:00.000Z" });
  expect(await h.exec(argv)).toBe(0);
  return JSON.parse(h.text()) as Report;
};

const verdictOf = (report: Report, category: string): string | undefined =>
  report.categories.find((c) => c.category === category)?.verdict;

describe("atlas m720", () => {
  it("says the verdict of each category and the Spanish account it leaves out", async () => {
    const report = await run(["m720", "2027"]);
    expect(report.model).toBe("720");
    expect(verdictOf(report, "securities")).toBe("obliged");
    expect(verdictOf(report, "accounts")).toBe("not_obliged");
    // With the Spanish account in (90.000,00), the accounts would oblige too.
    expect(report.excluded.map((e) => e.account_id)).toEqual(["acc_es"]);
  });

  it("writes every amount as a decimal string", async () => {
    const report = await run(["m720", "2027"]);
    expect(typeof report.categories[0]?.value_eur.amount).toBe("string");
  });

  it("says what is missing instead of saying no", async () => {
    const without = abroad()
      .build()
      .filter((event) => event.type !== "valuation");
    expect(verdictOf(await run(["m720", "2027"], without), "securities")).toBe("undetermined");
  });
});

describe("atlas m721", () => {
  it("counts nothing recorded when there is no direct crypto, and does not say not obliged", async () => {
    const report = await run(["m721", "2027"]);
    expect(report.model).toBe("721");
    expect(verdictOf(report, "crypto")).toBe("nothing_recorded");
  });
});

describe("the year of the informative returns", () => {
  it.each(["m720", "m721"])("%s refuses a year that has not begun", async (model) => {
    const h = harness({ events: abroad().build(), instant: "2028-03-01T10:00:00.000Z" });
    expect(await h.exec([model, "2029"])).toBe(64);
    expect(h.text()).toContain(`el año 2029 aún no ha empezado: el modelo ${model.slice(1)}`);
    expect(await h.exec([model, "2028"])).toBe(0);
  });

  it("is not a year of atlas tax", async () => {
    const h = harness({ events: abroad().build(), instant: "2028-03-01T10:00:00.000Z" });
    expect(await h.exec(["tax", "720"])).not.toBe(0);
    expect(h.text()).toContain("2018");
  });
});

describe("atlas m721 before the model existed", () => {
  it("has no 2022", async () => {
    const report = await run(["m721", "2022"]);
    expect(report).toMatchObject({ period: "before_model" });
    expect(verdictOf(report, "crypto")).toBe("not_applicable");
  });
});

describe("atlas tax --boxes", () => {
  /** A ledger with a disposal in 2025, which is the year whose boxes are checked. */
  const withDisposal = (): Events => {
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_ib", "IE");
    b.asset("etf_a", "etf");
    b.deposit("acc_ib", "2024-01-04", "10000");
    b.buy("acc_ib", "etf_a", "2024-02-10", "100", "100");
    // With a withholding, so the return has a box the engine computes and cannot compute whole.
    b.sell("acc_ib", "etf_a", "2025-09-01", "100", "120", "2025-09-01", "380");
    return b;
  };
  interface Boxes {
    year: number;
    mapping: string;
    entries: { box?: string; missing?: boolean }[];
  }
  const boxes = async (year: string, instant: string): Promise<Boxes> => {
    const h = harness({ events: withDisposal().build(), instant });
    expect(await h.exec(["tax", year, "--boxes"])).toBe(0);
    return JSON.parse(h.text()) as Boxes;
  };

  it("has the checked boxes of 2025, and says what the ledger does not hold", async () => {
    const report = await boxes("2025", "2026-06-01T10:00:00.000Z");
    expect(report.mapping).toBe("checked");
    expect(report.entries.map((entry) => entry.box)).toEqual(
      expect.arrayContaining(["0460", "2227"]),
    );
    // The NIF is not in the ledger and is not invented.
    expect(report.entries.find((entry) => entry.box === "2225")?.missing).toBe(true);
  });

  it("gives another year by concept, with no box number at all", async () => {
    const report = await boxes("2026", "2027-06-01T10:00:00.000Z");
    expect(report.mapping).not.toBe("checked");
    expect(report.entries.length).toBeGreaterThan(0);
    expect(report.entries.every((entry) => entry.box === undefined)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("0460");
  });
});
