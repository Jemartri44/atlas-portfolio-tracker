// @vitest-environment happy-dom
//
// The preview shows what an event **changes**. A purchase of a fund listed its
// twenty-seven lots, twenty-five of them "4,7186 → 4,7186", with the new lot
// at the very bottom — and every quantity in plain text with the mask on.

import { type AccountId, Money, Quantity } from "@atlas/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { MASK } from "../src/format/money.js";
import { store } from "../src/ledger/state.js";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { previewChanges } from "../src/view-models/preview.js";
import {
  choose,
  DECIMAL,
  figuresLeft,
  press,
  show,
  text,
  today,
  type,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

/** Fills a purchase of World Index Fund in the form of the application. */
const fillPurchase = (host: HTMLElement, amount: string): void => {
  choose(host, "f-account_id", "acc_mi");
  choose(host, "f-asset_id", "ast_world");
  type(host, "f-quantity", "4,8765");
  type(host, "f-amount", amount);
};

describe("what changes, as data", () => {
  const lot = (id: string, quantity: string, closed = false) =>
    ({
      id,
      asset_id: "ast_world",
      acquisition_date: "2027-01-01",
      quantity: Quantity.parse(quantity),
      closed,
    }) as never;
  const position = (account_id: AccountId, quantity: string) =>
    ({ account_id, asset_id: "ast_world", quantity: Quantity.parse(quantity) }) as never;

  it("lists the new first, then what moves, and counts the rest", () => {
    const changes = previewChanges({
      before: {
        positions: [position("acc_mi", "10"), position("acc_b", "3")],
        lots: [lot("a", "1"), lot("b", "2"), lot("c", "3"), lot("d", "4"), lot("e", "0", true)],
      },
      after: {
        positions: [position("acc_mi", "15"), position("acc_b", "3")],
        lots: [
          lot("a", "1"),
          lot("b", "1"),
          lot("c", "3"),
          lot("d", "0", true),
          lot("e", "0", true),
          lot("new", "5"),
        ],
      },
    } as never);
    expect(changes.lots.map((row) => row.key)).toEqual(["new", "b", "d"]);
    expect(changes.lots[0]?.isNew).toBe(true);
    expect(changes.lots[2]?.closed).toBe(true);
    expect(changes.unchangedLots).toBe(3);
    expect(changes.positions.map((row) => row.key)).toEqual(["acc_mi|ast_world"]);
    expect(changes.unchangedPositions).toBe(1);
  });
});

describe("the cash, as data", () => {
  it("names the account, keeps the amounts and says when a balance ends below zero", () => {
    const eur = (amount: string) => Money.parse(amount, "EUR");
    const changes = previewChanges({
      before: { positions: [], lots: [] },
      after: { positions: [], lots: [] },
      cash: [
        { account_id: "acc_mi", currency: "EUR", before: eur("100"), after: eur("-61") },
        { account_id: "acc_ibkr", currency: "EUR", before: eur("0"), after: eur("300") },
      ],
    } as never);
    expect(changes.cash.map((row) => [row.key, row.short])).toEqual([
      ["acc_mi|EUR", true],
      ["acc_ibkr|EUR", false],
    ]);
  });
});

describe("what changes, on the preview of a purchase", () => {
  beforeEach(() => today("2026-09-18"));

  it("shows only what changes, the new lot first, and masks every quantity", async () => {
    store.setPrivacy(true);
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    fillPurchase(host, "600");
    await press(host, "Ver el efecto");

    const preview = host.querySelector(".preview");
    const shown = text(preview);
    expect(shown).toMatch(/\d+ lotes sin cambios/);
    const section = (title: string) =>
      [...(preview?.querySelectorAll("section.card") ?? [])].find(
        (card) => card.querySelector("h2")?.textContent === title,
      );
    // The new lot is the first row of the lots, and it says it is new.
    expect(text(section("Lotes fiscales")?.querySelector(".change"))).toContain("nuevo");
    // The cash of the account the purchase is paid from, before and after, masked.
    const cash = section("Efectivo");
    expect(text(cash?.querySelector(".change-name"))).toContain("Fondos indexados · EUR");
    expect(cash?.querySelectorAll(".change .mask")).toHaveLength(2);
    // A masked quantity keeps its unit (D2): what kind of figure, never how big.
    const units = [...(section("Posiciones")?.querySelectorAll(".mask .unit") ?? [])].map(text);
    expect(units).toEqual(["part.", "part."]);
    // Not one quantity of the data with the mask on: they were painted raw
    // before. The sentence on top is what the user just typed, and reads so.
    const data = [...(preview?.querySelectorAll("section.card") ?? [])].map(text).join(" ");
    expect(data).toContain(MASK);
    expect(data).not.toMatch(/\d+\.\d{3,}/);
    expect(DECIMAL.test(figuresLeft(data))).toBe(false);
    expect(text(preview?.querySelector(".sentence"))).toMatch(/^Vas a registrar la compra de /);
    expect(text(preview?.querySelector(".sentence"))).toContain("por 600,00 €");
  });
});
