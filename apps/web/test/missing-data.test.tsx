// @vitest-environment happy-dom
//
// A figure that is missing is «sin dato», never a zero (constitution V). On
// 18/09/2026 the summary said "Renta fija 0,00 EUR · Oro 0,00 EUR · Cripto
// 0,00 EUR · Cubo 0,00 EUR" for assets that exist and have no price.

import { Money, type NetWorth, netWorth, projectLedger, settingsAt } from "@atlas/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { nameIndex } from "../src/format/names.js";
import Resumen from "../src/routes/resumen/index.jsx";
import { netWorthView } from "../src/view-models/index.js";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, today, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("the patrimony, as data", () => {
  it("shows a class of the core with no price as missing, not as 0,00", () => {
    // At 18/09/2026 the golden ledger holds bonds, gold and bitcoin without a price.
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true, asOf: "2026-09-18" });
    const view = netWorthView(
      netWorth(state, "2026-09-18", settingsAt(state, "2026-09-18").settings),
      nameIndex(state),
    );
    const core = view.blocks[0];
    const byName = new Map(core?.lines.map((line) => [line.name, line]));
    expect(byName.get("Renta fija")?.value).toBeUndefined();
    expect(byName.get("Oro")?.value).toBeUndefined();
    expect(byName.get("Renta variable")?.value).toBeDefined();
    expect(byName.get("Renta variable")?.partial).toBeUndefined();
    // The bucket holds one position and it has no price: the block is unknown.
    expect(view.blocks[1]?.lines.length).toBe(1);
    expect(view.blocks[1]?.subtotal).toBeUndefined();
    // And the total is still the sum of what is shown.
    expect(view.total).toBeDefined();
  });

  it("keeps a genuine zero: a block with nothing in it is 0, not «sin dato»", () => {
    const empty = {
      date: "2027-01-01",
      core: { by_class: [], total_eur: Money.zero("EUR"), partial: false, missing_prices: [] },
      bucket: { rows: [], total_eur: Money.zero("EUR"), partial: false, missing_prices: [] },
      cash: { rows: [], total_eur: Money.zero("EUR"), partial: false, missing_rates: [] },
      total_eur: Money.zero("EUR"),
      partial: false,
      warnings: [],
    } as NetWorth;
    const view = netWorthView(empty);
    expect(view.blocks.map((block) => block.subtotal?.amount.toString())).toEqual(["0", "0", "0"]);
    expect(view.total?.isZero()).toBe(true);
  });
});

describe("the patrimony, on the summary", () => {
  beforeEach(() => today("2026-09-18"));

  it("says «sin dato» for the classes and the bucket that have no price", async () => {
    const host = await show("/", Resumen);
    const worth = text(host.querySelector('[aria-label="Patrimonio total"]'));
    expect(worth).toMatch(/Renta fija\s*sin dato/);
    expect(worth).toMatch(/Oro\s*sin dato/);
    expect(worth).toMatch(/Cubo\s*sin dato/);
    expect(worth).not.toMatch(/(Renta fija|Oro|Cripto|Cubo)\s*0,00/);
  });
});
