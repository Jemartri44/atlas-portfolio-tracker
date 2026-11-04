// @vitest-environment happy-dom
//
// The automatic prices in the web: read from our own cloud with the session (`GET
// /api/reference/prices`), held in memory, never written on the device; shown with their origin, the
// approximation marked, the quote without an ECB rate said, and the cloud not answering said too.

import { Decimal, Money } from "@atlas/domain";
import { readEcbZipCsv } from "@atlas/domain/ecb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Price, PriceDetail } from "../src/components/Price.jsx";
import { forgetWebHistory } from "../src/ecb/history.js";
import { externalOf, forgetPrices, loadWebQuotes } from "../src/prices/quotes.js";
import Ajustes from "../src/routes/ajustes/index.jsx";
import Cartera from "../src/routes/cartera/index.jsx";
import { serveReference } from "./helpers/cloud-reference.js";
import { show, text, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

let restore: (() => void) | undefined;
const cloud = (...args: Parameters<typeof serveReference>): void => {
  restore?.();
  forgetPrices();
  forgetWebHistory();
  restore = serveReference(...args);
};
beforeEach(() => cloud({}));
afterEach(() => {
  restore?.();
  restore = undefined;
  forgetPrices();
  forgetWebHistory();
});

const line = (date: string, close: string, currency = "EUR") =>
  `${JSON.stringify({ schema_version: 1, date, close, currency, source: "eodhd", fetched_at: "2029-06-30T06:00:00.000Z" })}\n`;

const pence = JSON.stringify({
  symbols_format: 2,
  assets: { ast_world: { eodhd: "W.LSE", currencies: { eodhd: "GBX" }, confirmed_at: "x" } },
});

describe("reading the prices of the cloud", () => {
  it("reads each asset's file with the session and keeps nothing on the device", async () => {
    cloud({ prices: { ast_world: line("2029-06-29", "999") } });
    const quotes = await loadWebQuotes(["ast_world", "ast_bonds"]);
    expect(quotes.origin).toBe("cloud");
    expect(quotes.closes.get("ast_world")?.[0]?.close).toBe("999");
    expect(quotes.closes.has("ast_bonds")).toBe(false);
  });

  it("has no automatic price when the cloud has no file, and says nothing is wrong", async () => {
    const quotes = await loadWebQuotes(["ast_world"]);
    expect(quotes.closes.size).toBe(0);
    expect(quotes.origin).toBeUndefined();
    expect(quotes.problem).toBeUndefined();
  });

  it("says the cloud did not answer, and does not take it for a lack of prices", async () => {
    cloud({ status: 503 });
    expect((await loadWebQuotes(["ast_world"])).problem).toBe("unavailable");
  });

  it("does not disguise a failure of its own as the cloud being down (review M9)", async () => {
    cloud({ prices: { ast_world: line("2029-06-29", "999") }, symbols: "{" });
    const quotes = await loadWebQuotes(["ast_world"]);
    expect(quotes.problem).toBeUndefined();
    expect(quotes.symbols).toMatchObject({ problem: "unreadable" });
  });

  it("reads each file once per page, and again after forgetting", async () => {
    let asked = 0;
    const holder = globalThis as { fetch: typeof fetch };
    cloud({ prices: { ast_world: line("2029-06-29", "999") } });
    const inner = holder.fetch;
    holder.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      asked += String(input).includes("/prices/") ? 1 : 0;
      return inner(input, init);
    }) as typeof fetch;
    await loadWebQuotes(["ast_world"]);
    const first = asked;
    await loadWebQuotes(["ast_world"]);
    expect(asked).toBe(first);
    forgetPrices();
    await loadWebQuotes(["ast_world"]);
    expect(asked).toBe(first * 2);
  });

  it("feeds the gate: the weights of Cartera show the close, with its source", async () => {
    cloud({ prices: { ast_world: line("2029-06-29", "999") } });
    const host = await show("/cartera", Cartera);
    await until(() => text(host).includes("EODHD"), "the source of the close");
    expect(text(host)).toContain("EODHD");
  });
});

describe("the correspondence beside the prices", () => {
  it("leaves out what symbols.json says is stored in the wrong currency", async () => {
    cloud({ prices: { ast_world: line("2029-06-29", "1000", "GBP") }, symbols: pence });
    const quotes = await loadWebQuotes(["ast_world"]);
    expect(quotes.closes.get("ast_world")).toEqual([]);
    expect(quotes.mismatched).toMatchObject([{ asset_id: "ast_world", count: 1 }]);
    expect(quotes.symbols).toBeUndefined();
  });

  it("says it cannot check the currency of prices that come without symbols.json", async () => {
    cloud({ prices: { ast_world: line("2029-06-29", "999") } });
    expect((await loadWebQuotes(["ast_world"])).symbols).toEqual({ problem: "missing" });
    const host = await show("/cartera", Cartera);
    await until(
      () => text(host).includes("no se puede comprobar la divisa"),
      "the warning about the currency of the prices",
    );
  });
});

describe("Ajustes", () => {
  it("shows how many assets have a price, read from the cloud, with nothing to import", async () => {
    cloud({ prices: { ast_world: line("2029-06-29", "999") } });
    const host = await show("/ajustes", Ajustes);
    await until(() => text(host).includes("Leídos de tu nube: un activo"), "the prices card");
    expect(text(host)).not.toContain("Importar");
    expect(text(host)).not.toContain("Borrar los precios importados");
  });

  it("says there are no automatic prices when the cloud has none", async () => {
    const host = await show("/ajustes", Ajustes);
    await until(() => text(host).includes("Sin precios automáticos."), "the prices card");
  });
});

describe("the ECB rates for the cash", () => {
  it("without any close, still gives the ECB history's rates for the cash of the net worth", () => {
    // Live test of 2026-09-27: the net worth valued the dollars with the
    // ledger's rate of weeks before while the history had newer ones.
    const history = readEcbZipCsv("Date,USD,\n2029-06-28,1.25,\n2029-06-27,1.2,\n");
    const quotes = {
      closes: new Map(),
      unreadable: [],
      mismatched: [],
      history: { history, staleDays: 30 },
    };
    const external = externalOf(quotes, {} as never);
    expect(external?.at("ast_world", "2029-06-29")).toBeUndefined();
    expect(external?.latestRate?.("USD", "2029-06-29")).toMatchObject({
      rate: Decimal.parse("1.25"),
      date: "2029-06-28",
    });
    // Without a history, nothing, as before.
    expect(externalOf({ ...quotes, history: { staleDays: 30 } }, {} as never)).toBeUndefined();
  });
});

describe("a price on the screen", () => {
  it("marks an approximation, a quote without its value in euros, and says its origin", async () => {
    const price = {
      unitValue: Money.of(Decimal.parse("220"), "EUR"),
      priceDate: "2029-06-29",
      ageDays: 2,
      stale: false,
      priceOrigin: "EODHD",
      approximate: true,
      eurMissing: "el BCE no publica esa divisa",
    };
    const host = document.createElement("div");
    document.body.append(host);
    const { render } = await import("solid-js/web");
    const dispose = render(
      () => (
        <>
          <Price price={price} />
          <PriceDetail price={price} />
        </>
      ),
      host,
    );
    const shown = text(host);
    expect(shown).toContain("aproximado");
    expect(shown).toContain("sin valor en euros");
    expect(shown).toContain("EODHD");
    expect(shown).toContain("falta su valor en euros (el BCE no publica esa divisa)");
    dispose();
  });
});

describe("the calculator of the contribution in the web", () => {
  it("says the note of the domain when a weight rests on an approximation, and adds nothing of its own", async () => {
    const { contributionView } = await import("../src/view-models/core/contribution.js");
    const note = {
      code: "weights_use_approximation",
      event_id: "",
      message: "x",
      details: { assets: ["ast_world"] },
    };
    const plan = {
      date: "2029-06-30",
      amount_eur: Money.of(Decimal.parse("100"), "EUR"),
      amount_origin: "flag",
      bucket_budget_eur: Money.of(Decimal.parse("10"), "EUR"),
      core_amount_eur: Money.of(Decimal.parse("90"), "EUR"),
      core_value_eur: Money.of(Decimal.parse("90"), "EUR"),
      purchases_only_eur: Money.of(Decimal.parse("0"), "EUR"),
      surplus_distributed: false,
      rows: [],
      warnings: [note],
    } as never;
    expect(contributionView(plan).approximation).toBe(note);
    expect(
      contributionView({ ...(plan as object), warnings: [] } as never).approximation,
    ).toBeUndefined();
  });
});
