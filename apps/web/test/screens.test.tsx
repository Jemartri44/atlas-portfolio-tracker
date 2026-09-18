// @vitest-environment happy-dom
//
// The two analytical screens, **rendered**. Not their view-models: the screens,
// with the store loaded and the router in front, because that wiring is where
// the four rules of this feature actually take effect and where the blocking
// defect of feature 004 was born.
//
// What it caught when it was written: eight mutations of that wiring — the
// privacy mask on a chart, the hole that must not be spanned, and both screens
// forgetting to cut the ledger by the date asked — every one of which left the
// rest of the suite green.

import { BlobLedgerStore, type LedgerBlob } from "@atlas/adapters/blob";
import {
  coreWeights,
  fingerprintOf,
  projectLedger,
  settingsAt,
  type UseCaseDeps,
} from "@atlas/domain";
import { Route, Router } from "@solidjs/router";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatMoney, MASK } from "../src/format/money.js";
import { loadInto } from "../src/ledger/actions.js";
import { store } from "../src/ledger/state.js";
import Cubo from "../src/routes/cubo/index.jsx";
import Nucleo from "../src/routes/nucleo/index.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { goldenEvents, goldenText } from "./helpers/golden.js";

class MemoryBlob implements LedgerBlob {
  readonly label = "memoria";
  constructor(readonly text: string) {}
  async read(): Promise<Uint8Array> {
    return new TextEncoder().encode(this.text);
  }
  async write(): Promise<void> {
    throw new Error("estas pantallas no escriben");
  }
  async writeArchive(): Promise<void> {
    throw new Error("estas pantallas no escriben");
  }
}

const deps = (text: string = goldenText()): UseCaseDeps => ({
  store: new BlobLedgerStore(new MemoryBlob(text)),
  clock: { now: () => new Date("2029-07-01T10:00:00.000Z") },
  random: (target) => target.fill(7),
});

const disposers: (() => void)[] = [];

/** Renders one screen at one URL, with the ledger already open. */
const show = async (path: string, screen: () => unknown): Promise<HTMLElement> => {
  window.history.replaceState({}, "", path);
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <Router>
          <Route path="*" component={screen as never} />
        </Router>
      ),
      host,
    ),
  );
  // The screens read a memo per date; one turn of the loop is enough.
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return host;
};

const text = (host: HTMLElement): string => (host.textContent ?? "").replace(/\s+/g, " ");

beforeEach(async () => {
  store.setPrivacy(false);
  await loadInto({ deps: deps(), source: { kind: "browser", persisted: false } });
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
  store.setPrivacy(false);
});

/** What the domain says the core weighs at a date: the answer the screen owes. */
const coreTotalAt = (date: string): string => {
  const state = projectLedger(goldenEvents(), { collectErrors: true, asOf: date });
  const total = coreWeights(state, date, settingsAt(state, date).settings).total_eur;
  return formatMoney(total, { currency: false });
};

describe("Núcleo cuts the ledger by the date asked", () => {
  /**
   * The blocking defect of feature 004, literally: quantities taken from the end
   * of the ledger while the date only chose the prices. The screens have to
   * project with `asOf` (ADR-0016), and this is the only test that looks at the
   * place where that decision is made.
   */
  it("shows the figures of the date in the address, not of the last event", async () => {
    const early = text(await show("/nucleo?fecha=2027-01-31", Nucleo));
    expect(early).toContain(coreTotalAt("2027-01-31"));

    const late = text(await show("/nucleo?fecha=2027-12-31", Nucleo));
    expect(late).toContain(coreTotalAt("2027-12-31"));

    // And the two are genuinely different books, not the same one twice.
    expect(coreTotalAt("2027-01-31")).not.toBe(coreTotalAt("2027-12-31"));
    expect(early).not.toContain(coreTotalAt("2027-12-31"));
  });

  it("says «sin dato» instead of a zero where a price is missing", async () => {
    const host = await show("/nucleo?fecha=2027-06-30", Nucleo);
    const shown = text(host);

    expect(shown).toContain("sin dato");
    expect(shown).toContain("parcial");
  });
});

describe("Cubo cuts the ledger by the date asked", () => {
  it("shows the positions of that date and not of the end of the ledger", async () => {
    const early = text(await show("/cubo?fecha=2027-01-31", Cubo));
    const late = text(await show("/cubo?fecha=2027-12-31", Cubo));

    // In January 2027 the bucket holds Alpha Robotics and Beta Biotech and is
    // worth 997,53; by December it holds four other things and is worth
    // 1.185,42 and partial. Each screen shows its own total and not the other's.
    expect(early).toContain("997,53");
    expect(early).not.toContain("1.185,42");
    expect(late).toContain("1.185,42");
    expect(late).not.toContain("997,53");
    expect(early).toContain("Alpha Robotics");
    expect(late).toContain("Gamma Semiconductors");
  });

  it("keeps the two books apart: no figure of the core leaks into the bucket", async () => {
    const host = await show("/cubo?fecha=2027-12-31", Cubo);
    const shown = text(host);

    expect(shown).not.toContain("Renta variable");
    expect(shown).not.toContain("Money Market Fund");
    // The one bounded exception is the net worth, and it travels labelled.
    expect(shown).toContain("Excepción acotada");
  });
});

/** Everything but the percentages and the points, which stay visible on purpose. */
const withoutPercentages = (shown: string): string =>
  shown.replace(/[\d.]+,\d+\s?(%|pp)/g, "").replace(/[+−-]/g, "");

/** A Spanish decimal: an amount, a price or a quantity has one; a date does not. */
const DECIMAL = /\d,\d/;

describe("the privacy mode covers the two screens", () => {
  /**
   * Eight places used to interpolate a quantity or a unit price straight into
   * the markup: with the mask on they read "26.9016 participaciones a 187.4321
   * EUR", and a quantity times a public price **is** the amount. This is the
   * regression test, and it looks at the rendered screen because that is the
   * only place the leak was visible.
   *
   * What it checks: after taking out the percentages and the points — which stay
   * visible on purpose (`docs/specification.md` §9.6) — **no Spanish decimal
   * survives anywhere**. A quantity (23,0274), a price (81,9400) and an amount
   * (8.014,16) all have one; a duration, a thesis identifier and a range label
   * do not.
   *
   * The prose of a warning used to escape it: "el aporte bruto al cubo (5000
   * EUR) pasa del 80 % del tope de 6000 EUR" was printed with the mask on,
   * because a sentence is a string and never went through `Amount`. It goes
   * through `format/privacy.ts` now, and the assertion below names that very
   * sentence.
   */
  it("leaves no amount, price or quantity visible on Núcleo", async () => {
    store.setPrivacy(true);
    const shown = text(await show("/nucleo?fecha=2027-01-31", Nucleo));

    expect(shown).toContain(MASK);
    expect(DECIMAL.test(withoutPercentages(shown))).toBe(false);
  });

  it("leaves no amount, price or quantity visible on Cubo", async () => {
    store.setPrivacy(true);
    const shown = text(await show("/cubo?fecha=2027-12-31", Cubo));

    expect(shown).toContain(MASK);
    expect(DECIMAL.test(withoutPercentages(shown))).toBe(false);
    // Including the ones a warning **says**. This is the sentence the review of
    // feature 007 found (N11), and the bucket screen has its own call to the
    // catalogue: masking it in the summary would not have masked it here.
    expect(shown).toContain(`El aporte bruto al cubo (${MASK}) pasa del 80 % del tope de ${MASK}`);
  });

  /** And with the mask off they are all there: the test is not passing on an empty page. */
  it("shows them all again when privacy is off", async () => {
    store.setPrivacy(false);
    const shown = text(await show("/nucleo?fecha=2027-01-31", Nucleo));

    expect(shown).not.toContain(MASK);
    expect(shown).toContain(coreTotalAt("2027-01-31"));
    // A quantity and a unit price, the two shapes that used to bypass the gate.
    expect(shown).toContain("23,0274");
    expect(shown).toContain("81,9400");
  });

  it("shows what the warnings of the bucket say when the mask is off", async () => {
    store.setPrivacy(false);
    const shown = text(await show("/cubo?fecha=2027-12-31", Cubo));

    expect(shown).toContain(
      "El aporte bruto al cubo (5.000,00 EUR) pasa del 80 % del tope de 6.000,00 EUR",
    );
  });

  it("still shows the percentages, which are the useful thing in public", async () => {
    store.setPrivacy(true);
    const shown = text(await show("/nucleo?fecha=2027-01-31", Nucleo));

    expect(shown).toMatch(/\d+,\d+ %/);
    expect(shown).toMatch(/[+−]\d+,\d+ pp/);
  });
});

/**
 * A transfer request left open long before any plausible "today", so it is
 * overdue whenever this test runs and stays overdue tomorrow.
 *
 * `transfer_max_days` had existed since phase 1 with nobody reading it; feature
 * 007 added `transferWatch`, which applies it — and the summary went on calling
 * `pendingTransfers`, the plain query that knows nothing about the rule. The
 * warning was computed, translated in both catalogues and shown nowhere.
 */
const CATALOGUE = [
  {
    schema_version: 1,
    id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
    recorded_at: "2026-01-02T10:00:00.000Z",
    type: "settings_changed",
    settings: {
      fiscal_date_rule: {
        stock: "trade_date",
        etf: "trade_date",
        etc: "trade_date",
        etp: "trade_date",
        crypto: "trade_date",
        fund: "value_date",
        money_market: "value_date",
      },
      wash_sale_window: {
        stock: "2m",
        etf: "2m",
        etc: "2m",
        etp: "2m",
        crypto: "1y",
        fund: "1y",
        money_market: "1y",
      },
      monthly_contribution_eur: "600",
      bucket_pct_of_contribution: "10",
      transfer_max_days: 15,
    },
  },
  {
    schema_version: 1,
    id: "01AAAAAAAAAAAAAAAAAAAAAAAB",
    recorded_at: "2026-01-02T10:00:01.000Z",
    type: "account_created",
    account_id: "acc_mi",
    name: "Fondos indexados",
    platform: "myinvestor",
    book: "core",
    country: "ES",
    base_currency: "EUR",
    active: true,
  },
  {
    schema_version: 1,
    id: "01AAAAAAAAAAAAAAAAAAAAAAAC",
    recorded_at: "2026-01-02T10:00:02.000Z",
    type: "asset_created",
    asset_id: "ast_world",
    asset_type: "fund",
    book: "core",
    asset_class: "equity",
    isin: "XX0000000001",
    name: "World Index Fund",
    currency: "EUR",
    transferable: true,
    active: true,
  },
  {
    schema_version: 1,
    id: "01AAAAAAAAAAAAAAAAAAAAAAAD",
    recorded_at: "2026-01-02T10:00:03.000Z",
    type: "asset_created",
    asset_id: "ast_bonds",
    asset_type: "fund",
    book: "core",
    asset_class: "fixed_income",
    isin: "XX0000000002",
    name: "Global Bond Index Fund",
    currency: "EUR",
    transferable: true,
    active: true,
  },
];

/**
 * The catalogue plus the events a test needs, as a ledger file. An operation
 * carries a fingerprint by contract, so it is computed here instead of being
 * written by hand: the domain owns that shape.
 */
const ledgerOf = (...events: Record<string, unknown>[]): string =>
  [...CATALOGUE, ...events]
    .map((event) => {
      const fingerprint = fingerprintOf(event as never);
      return JSON.stringify(fingerprint === undefined ? event : { ...event, fingerprint });
    })
    .join("\n");

const OVERDUE = ledgerOf({
  schema_version: 1,
  id: "01AAAAAAAAAAAAAAAAAAAAAAAE",
  recorded_at: "2026-01-15T10:00:00.000Z",
  type: "transfer_requested",
  from_account_id: "acc_mi",
  from_asset_id: "ast_world",
  to_account_id: "acc_mi",
  to_asset_id: "ast_bonds",
  quantity_out: "10",
  requested_date: "2026-01-15",
});

describe("Resumen applies the rule of `transfer_max_days`", () => {
  it("puts an overdue request in the attention list, in Spanish", async () => {
    await loadInto({ deps: deps(OVERDUE), source: { kind: "browser", persisted: false } });
    const shown = text(await show("/", Resumen));

    expect(shown).toContain("El traspaso de World Index Fund a Global Bond Index Fund lleva");
    expect(shown).toContain("más de los 15 configurados");
    // And the plain count of open requests is still there beside it.
    expect(shown).toContain("traspaso en curso");
  });
});

/**
 * A loss-making sale of a fund bought inside the wash-sale window, so the
 * summary carries a warning whose figures live **inside the sentence**: "Venta
 * con pérdida de World Index Fund (−525,00 EUR) con una compra del 2026-01-14
 * (10,5 títulos)…". The dates are in the past of any plausible "today", which
 * is what keeps this ledger stable: the summary projects at today's date.
 */
const WASH_SALE = ledgerOf(
  {
    schema_version: 1,
    id: "01AAAAAAAAAAAAAAAAAAAAAAAF",
    recorded_at: "2026-01-12T10:00:00.000Z",
    type: "buy",
    account_id: "acc_mi",
    asset_id: "ast_world",
    trade_date: "2026-01-12",
    value_date: "2026-01-14",
    quantity: "10.5",
    unit_price: "100",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2026-01-12",
    fee: "0",
    source: "manual",
  },
  {
    schema_version: 1,
    id: "01AAAAAAAAAAAAAAAAAAAAAAAG",
    recorded_at: "2026-02-10T10:00:00.000Z",
    type: "sell",
    account_id: "acc_mi",
    asset_id: "ast_world",
    trade_date: "2026-02-10",
    value_date: "2026-02-12",
    quantity: "10.5",
    unit_price: "50",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2026-02-10",
    fee: "0",
    source: "manual",
  },
);

/**
 * **The prose of a warning is a figure too** (N11 of the review of feature 007).
 *
 * The tables, the cards and the axes were masked and covered by tests, and the
 * warning right under them went on saying "el aporte bruto al cubo (5000 EUR)
 * supera el tope de 6000 EUR" with the mask on. A privacy mode that does that
 * is not a privacy mode.
 *
 * It is rendered, and it looks at the attention block of the summary, because
 * a test over `describeWarning` proves the function masks and proves nothing
 * about the screen that calls it: the defect was never in the formatting, it
 * was in the call. Mutating `privacy: store.privacy()` in `resumen/index.tsx`,
 * or the `privacy` that `attentionItems` hands on, has to land here.
 */
describe("the privacy mode covers the prose of the warnings", () => {
  /** Only the attention block: the rest of the summary is already covered. */
  const attention = (host: HTMLElement): string =>
    (host.querySelector('[aria-label="Lo que reclama atención"]')?.textContent ?? "").replace(
      /\s+/g,
      " ",
    );

  beforeEach(async () => {
    await loadInto({ deps: deps(WASH_SALE), source: { kind: "browser", persisted: false } });
  });

  it("masks the amount and the quantity a warning says", async () => {
    store.setPrivacy(true);
    const shown = attention(await show("/", Resumen));

    // The warning is there, with its name, its dates and its window intact.
    expect(shown).toContain("Venta con pérdida de World Index Fund");
    expect(shown).toContain("2026-01-14");
    expect(shown).toContain("ventana de un año");
    // And nothing of what it is worth: neither the loss nor the units.
    expect(shown).toContain(MASK);
    expect(shown).not.toContain("525");
    expect(shown).not.toContain("10,5");
    expect(DECIMAL.test(withoutPercentages(shown))).toBe(false);
  });

  it("says them both again with the mask off", async () => {
    store.setPrivacy(false);
    const shown = attention(await show("/", Resumen));

    expect(shown).not.toContain(MASK);
    expect(shown).toContain("525,00 EUR");
    expect(shown).toContain("10,5 títulos");
  });
});
