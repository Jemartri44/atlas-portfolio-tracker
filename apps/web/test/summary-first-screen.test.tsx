// @vitest-environment happy-dom
//
// The first screenful of the summary by importance (feature 020, E2, M2):
//
//   - the risk of losing the data goes first and in one line, always, and is
//     not repeated inside *Atención*;
//   - the tax card goes first only in the income tax season; out of it, a row
//     at the end with its neutral state, and what is pending of the 720 and
//     the 721 goes to *Atención*, in a row kept for it on the first paint
//     when the ledger has an account abroad, so nothing jumps;
//   - out of the season and with invalid events, the tax sentence joins the
//     group of the invalid events;
//   - «pendiente» in one line when one price is missing.
//
// The dates are those of the captures: 20/01/2029, out of the season, and
// 15/05/2029, in it. The golden ledger has an account in Ireland and was
// never exported from this browser.

import { describe, expect, it } from "vitest";
import { NoticeList } from "../src/components/Notice.jsx";
import { Pending } from "../src/components/States.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { NetWorthBlock } from "../src/routes/resumen/NetWorthBlock.jsx";
import { fiscalSlot } from "../src/view-models/index.js";
import { goldenText } from "./helpers/golden.js";
import { openLedger, show, text, today, until, withGoldenLedger } from "./helpers/render.jsx";
import { applied, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();

const order = (host: HTMLElement): string[] =>
  [...(host.querySelector(".grid")?.children ?? [])].map(
    (child) => [...child.classList].find((name) => name.startsWith("summary-")) ?? child.className,
  );

const attention = (host: HTMLElement): Element | null =>
  host.querySelector('[aria-label="Lo que reclama atención"]');

describe("the summary out of the income tax season", () => {
  it("says the risk of losing the data first, then how much, what to do, what happened, how it got here and the tax row", async () => {
    today("2029-01-20");
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-fiscal") !== null, "la fila fiscal");
    expect(order(host)).toEqual([
      "summary-loss",
      "summary-worth",
      "summary-attention",
      "summary-moves",
      "summary-evolution",
      "summary-fiscal",
    ]);
    expect(text(attention(host))).not.toContain("exportado");
  });

  it("keeps a row in Atención for the 720 while the engine answers, then fills it, once", async () => {
    today("2029-01-20");
    const host = await show("/", Resumen);
    // First paint: an account abroad, so the row is kept.
    const reservedAtFirst = attention(host)?.querySelector(".notice-reserved") !== null;
    await until(
      () => attention(host)?.querySelector(".notice-reserved") === null,
      "que llegue el estado fiscal",
    );
    expect(reservedAtFirst).toBe(true);
    const notices = [...(attention(host)?.querySelectorAll(".notices > li") ?? [])];
    const fiscal = notices.filter((li) => /Modelo 72[01]/.test(text(li)));
    expect(fiscal).toHaveLength(1);
    expect(fiscal[0]?.querySelector('a[href="/fiscal"]')).not.toBeNull();
    // Among the four in sight: at most the fourth.
    expect(notices.indexOf(fiscal[0] as Element)).toBeLessThanOrEqual(3);
    // Said once: the row of the tax card does not repeat it.
    await until(
      () => /sin declarar/.test(text(host.querySelector(".summary-fiscal"))),
      "la fila fiscal con su estado",
    );
    expect(text(host.querySelector(".summary-fiscal"))).not.toMatch(/Modelo 72[01]/);
  });

  it("keeps no row without an account abroad", async () => {
    // The golden ledger without its Irish account and what it held there.
    const domestic = goldenText()
      .split("\n")
      .filter((line) => !line.includes("acc_ibkr") && !line.includes('"country":"IE"'))
      .join("\n");
    await openLedger(domestic);
    today("2029-01-20");
    const host = await show("/", Resumen);
    expect(attention(host)?.querySelector(".notice-reserved")).toBeNull();
  });

  it("adds the tax sentence to the group of the invalid events, not to the row", async () => {
    // A sale of what was never held: an invalid event of the degraded projection.
    const lines = goldenText()
      .split("\n")
      .filter((line) => line !== "");
    const sell = lines.find((line) => line.includes('"type":"sell"')) as string;
    const invalid = sell
      .replace(/"id":"[^"]+"/, '"id":"01ARYZ6S41TSV4RRFFQ69ZZZZZ"')
      .replace(/"quantity":"[^"]+"/, '"quantity":"999999"')
      .replace(/"fingerprint":"[^"]+"/, '"fingerprint":"sha256:invalid-020"');
    await openLedger(`${[...lines, invalid].join("\n")}\n`);
    today("2029-01-20");
    const host = await show("/", Resumen);
    const list = text(attention(host));
    expect(list).toMatch(/inválido/);
    expect(list.match(/no se calcula nada fiscal/g)).toHaveLength(1);
    expect(text(host.querySelector(".summary-fiscal"))).not.toContain("no se calcula");
  });
});

describe("the place of the 720 and the 721 in Atención", () => {
  const lines = [
    "Te toca presentar el Modelo 720 de 2028 por los valores y fondos en el extranjero.",
  ];

  it("is none in the season, where the card says it", () => {
    expect(fiscalSlot({ season: true, abroad: true, answer: undefined })).toBeUndefined();
    expect(fiscalSlot({ season: true, abroad: true, answer: { lines } })).toBeUndefined();
  });

  it("is a row kept before the engine answers, only with an account abroad", () => {
    expect(fiscalSlot({ season: false, abroad: true, answer: undefined })).toBe("reserved");
    expect(fiscalSlot({ season: false, abroad: false, answer: undefined })).toBeUndefined();
  });

  it("is one notice to the fiscal screen once it answers, or nothing", () => {
    expect(fiscalSlot({ season: false, abroad: true, answer: { lines } })).toEqual({
      message: lines[0],
      action: { label: "Ver la declaración", to: "/fiscal" },
    });
    expect(fiscalSlot({ season: false, abroad: true, answer: { lines: [] } })).toBeUndefined();
  });
});

describe("the row kept in Atención", () => {
  it("has the height of the notice that fills it, on the phone and on the monitor", async () => {
    // Measured in Chromium with the golden ledger on 20/01/2029: 119.56px at
    // 400 and 71.38px at 2045, so nothing in the first screenful jumps when
    // the notice arrives (`medidas.json`, «jumps»).
    for (const [width, height] of [
      [400, "119.5632px"],
      [2045, "71.376px"],
    ] as const) {
      withStyles(width);
      const host = await show("/", () => <NoticeList items={[]} label="Avisos" reserve />);
      expect(applied(host.querySelector(".notice-reserved"), "min-height")).toBe(height);
      withoutStyles();
    }
    // Back to the viewport of the other tests: the order of the summary reads it.
    withStyles(1024);
    withoutStyles();
  });
});

describe("the summary in the income tax season", () => {
  it("puts the tax card right after the line of the data, and keeps no row in Atención", async () => {
    today("2029-05-15");
    const host = await show("/", Resumen);
    await until(() => host.querySelector(".summary-fiscal") !== null, "la tarjeta fiscal");
    expect(order(host).slice(0, 3)).toEqual(["summary-loss", "summary-fiscal", "summary-worth"]);
    expect(text(host.querySelector(".summary-fiscal"))).toContain("Campaña de la Renta");
    expect(attention(host)?.querySelector(".notice-reserved")).toBeNull();
  });
});

describe("«pendiente»", () => {
  it("is one line with one datum missing, and the well with two", async () => {
    const one = await show("/", () => (
      <Pending line action={{ label: "Registrar valoración", to: "/registrar/valuation" }}>
        Falta uno.
      </Pending>
    ));
    expect(one.querySelector(".pending")?.classList.contains("is-line")).toBe(true);
    // The summary on a date with one price missing (Alpha Spin-off).
    today("2029-01-20");
    const host = await show("/", Resumen);
    const pending = [...host.querySelectorAll(".summary-worth .pending")];
    expect(pending).toHaveLength(1);
    expect(pending[0]?.classList.contains("is-line")).toBe(true);
  });

  it("keeps the well when two data are missing", async () => {
    const host = await show("/", () => (
      <NetWorthBlock
        view={{ date: "2029-01-20", partial: true, blocks: [], missing: ["Alpha", "Beta"] }}
      />
    ));
    const pending = [...host.querySelectorAll(".pending")];
    expect(pending).toHaveLength(1);
    expect(pending[0]?.classList.contains("is-line")).toBe(false);
    expect(text(pending[0])).toContain("Alpha, Beta");
  });
});
