// @vitest-environment happy-dom
//
// The four estimates of the fiscal screen: the quota of the savings base, the
// "no recomprar hasta" list, the "¿y si vendo?" simulator and the package of
// the return. The figures are the domain's and are checked there by hand;
// this checks what the screen says with them, and what it must always say:
// that they are estimates, and that nothing is recorded.

import { Money, projectLedger } from "@atlas/domain";
import type { CurrencyLine, TaxYearReport } from "@atlas/domain/fiscal";
import { repurchaseCalendar } from "@atlas/domain/fiscal";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_NAMES } from "../src/format/names.js";
import { BaseCard } from "../src/routes/fiscal/BaseCard.jsx";
import Fiscal from "../src/routes/fiscal/index.jsx";
import { RepurchaseCard } from "../src/routes/fiscal/RepurchaseCard.jsx";
import { SaleSimulatorCard } from "../src/routes/fiscal/SaleSimulatorCard.jsx";
import { yearView } from "../src/view-models/fiscal/index.js";
import { repurchaseView } from "../src/view-models/fiscal/sale.js";
import { goldenEvents } from "./helpers/golden.js";
import { choose, press, settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const events = goldenEvents();
const open = async (year: number) => show(`/fiscal?ejercicio=${year}`, Fiscal, "/fiscal");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the estimated quota", () => {
  it("is labelled an estimate and laid out bracket by bracket under the base", async () => {
    // 2028: a base of 99.28, all at 19 %: 9.43 + 9.43 = 18.86 (the domain's own case).
    const host = await open(2028);
    const card = [...host.querySelectorAll("section")].find((node) =>
      text(node).includes("Cuota estimada del ahorro"),
    );
    const shown = text(card);
    expect(shown).toContain("estimación");
    expect(shown).toContain("no conoce el resto de tu Renta");
    expect(shown).toContain("Hasta 6.000 €");
    expect(shown).toContain("18,86");
    expect(shown).toContain("Retenciones (parte del ahorro, estimación)");
    // 2028 is after the day the scales were checked: said, not hidden.
    expect(shown).toContain("una ley podría cambiarla para 2028");
  });
});

describe("a loss whose repurchase window is open", () => {
  const eur = (value: string): Money => Money.parse(value, "EUR");
  const zero = eur("0");
  const loss: CurrencyLine = {
    event_id: "e30",
    kind: "conversion",
    account_id: "acc_us",
    currency: "USD",
    fiscal_date: "2028-12-01",
    amount: Money.parse("89", "USD"),
    proceeds_eur: eur("75.36"),
    cost_eur: eur("79.36"),
    gain_eur: eur("-4"),
    gain_eur_rounded: eur("-4"),
    lots: [],
    released_eur: zero,
    deferred_eur: zero,
    computable_eur: eur("-4"),
    computable_eur_rounded: eur("-4"),
    reacquired: [],
    provisional_until: "2029-12-01",
    criteria: ["4:currency_wash_sale"],
  };
  const report = {
    year: 2028,
    today: "2029-02-01",
    base_eur: zero,
    anchors: [],
    capital_gains: {
      lines: [],
      currency_lines: [loss],
      balance_eur: eur("-4"),
      foreign_releases_eur: zero,
    },
    movable_capital: {
      transmissions: [],
      dividends: [],
      interest: [],
      expenses: [],
      balance_eur: zero,
      foreign_releases_eur: zero,
    },
    compensation: { steps: [], pending: [], expired: [], limit_pct: "25" },
    doubtful: [],
    settled: [],
  } as unknown as TaxYearReport;

  it("says it is provisional beside its figure, not only in the notes", async () => {
    const host = await show("/", () => <BaseCard view={yearView(report, NO_NAMES)} />);
    const tags = [...host.querySelectorAll(".tag")].map(text);
    expect(tags).toContain("provisional hasta el 01/12/2029");
    // In the row of the figure itself, next to the amount.
    const cell = [...host.querySelectorAll("td, .row")].find((node) =>
      text(node).includes("provisional hasta el"),
    );
    expect(text(cell)).toMatch(/4,00/);
  });
});

describe("no recomprar hasta", () => {
  it("lists the asset, the last day and the loss at stake", async () => {
    // A loss of 0.55 € on 05/11/2027: a purchase until 05/01/2028 would defer it.
    const view = repurchaseView(repurchaseCalendar(events, "2027-11-20"), NO_NAMES);
    const host = await show("/", () => <RepurchaseCard view={view} />);
    const shown = text(host);
    expect(shown).toContain("No recomprar hasta");
    expect(shown).toContain("05/01/2028");
    expect(shown).toContain("0,55");
  });

  it("is not shown when no window is open", async () => {
    const view = repurchaseView(repurchaseCalendar(events, "2029-01-10"), NO_NAMES);
    const host = await show("/", () => <RepurchaseCard view={view} />);
    expect(text(host)).toBe("");
  });
});

describe("¿y si vendo?", () => {
  it("offers only what is held and prices the sale, recording nothing", async () => {
    const state = projectLedger(events);
    const before = events.length;
    const host = await show("/", () => (
      <SaleSimulatorCard
        state={state}
        events={events}
        date="2028-12-31"
        settings={state.fiscalSettings}
      />
    ));
    expect(text(host)).toContain("nada registrado");
    const select = host.querySelector("#sale-asset") as HTMLSelectElement;
    const offered = [...select.options].map((option) => option.value).filter((id) => id !== "");
    expect(offered.length).toBeGreaterThan(0);
    choose(host, "sale-asset", offered[0] as string);
    await settle(30);
    const shown = text(host);
    expect(shown).toContain("Ganancia o pérdida de la venta");
    expect(shown).toMatch(/Sube tu cuota estimada en|Reduce tu cuota estimada en/);
    expect(events).toHaveLength(before);
  });
});

describe("the package of the return", () => {
  it("downloads the boxes as a CSV worded like the screen", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:atlas";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const host = await open(2028);
    await press(host, "Descargar el paquete (CSV)");
    expect(blobs).toHaveLength(1);
    const csv = await (blobs[0] as Blob).text();
    expect(csv.startsWith("﻿tipo;apartado;")).toBe(true);
    // The block titles of the screen, not the codes of the domain.
    expect(csv).toContain(";Base del ahorro;");
  });

  it("prints only the card, with every block open", async () => {
    let printed: { card: boolean; open: boolean } | undefined;
    window.print = vi.fn(() => {
      const card = document.querySelector(".is-printing");
      printed = {
        card: text(card).includes("Tu declaración por casillas"),
        open: [...(card?.querySelectorAll("details") ?? [])].every((block) => block.open),
      };
    });
    const host = await open(2028);
    await press(host, "Imprimir o guardar en PDF");
    expect(printed).toEqual({ card: true, open: true });
    expect(document.querySelector(".is-printing")).toBeNull();
  });
});
