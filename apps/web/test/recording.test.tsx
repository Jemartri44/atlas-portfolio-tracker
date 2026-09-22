// @vitest-environment happy-dom
//
// Recording as composed in docs/design/system.md §7.4: the day to day as
// tiles, the rest folded; the bookkeeping of a form in «Más datos»; a purchase
// that never offers a delisted asset (a sale still does, and a valuation too);
// and, from 1024px, the effect beside a form that stays in sight.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import Registrar from "../src/routes/registrar/index.jsx";
import {
  choose,
  optionsOf,
  press,
  settle,
  show,
  text,
  today,
  type,
  withGoldenLedger,
} from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

describe("choosing what to record", () => {
  it("puts the day to day one tap away and folds the rest", async () => {
    const host = await show("/registrar", Registrar);
    const tiles = [...host.querySelectorAll(".tiles a.tile")];
    expect(tiles.map((tile) => tile.getAttribute("href"))).toEqual([
      "/registrar/buy",
      "/registrar/sell",
      "/registrar/cash-in",
      "/registrar/cash-out",
      "/registrar/dividend",
      "/registrar/valuation",
      "/registrar/order",
    ]);
    const folded = [...host.querySelectorAll(".groups details > summary")].map(text);
    expect(folded).toEqual([
      "Traspasos entre fondos",
      "Cubo especulativo",
      "Eventos corporativos",
      "Catálogo: cuentas y activos",
    ]);
  });
});

describe("a form", () => {
  it("folds the bookkeeping in «Más datos» and keeps what matters on top", async () => {
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    const more = host.querySelector("details.more-data");
    for (const id of ["f-broker_ref", "f-source", "f-notes"]) {
      expect(host.querySelector(`#${id}`)?.closest("details")).toBe(more);
    }
    for (const id of ["f-account_id", "f-asset_id", "f-quantity", "f-amount"]) {
      expect(host.querySelector(`#${id}`)?.closest("details")).toBeNull();
    }
  });

  it("never offers a delisted asset to buy, and still to sell or to value", async () => {
    const offered = async (form: string): Promise<string[]> => {
      const host = await show(`/registrar/${form}`, RegistrarForm, "/registrar/:tipo");
      choose(host, "f-account_id", "acc_bucket");
      await settle();
      const options = optionsOf(host, "f-asset_id");
      host.remove();
      return options;
    };
    expect((await offered("buy")).join(" | ")).not.toContain("Alpha Spin-off");
    expect((await offered("sell")).join(" | ")).toContain("Alpha Spin-off");
    expect((await offered("valuation")).join(" | ")).toContain("Alpha Spin-off");
  });
});

describe("the effect of a record", () => {
  beforeEach(() => today("2026-09-18"));

  const fill = (host: HTMLElement): void => {
    choose(host, "f-account_id", "acc_mi");
    choose(host, "f-asset_id", "ast_world");
    type(host, "f-quantity", "4,8765");
    type(host, "f-amount", "600");
  };

  it("replaces the form on a phone, with the way back", async () => {
    withStyles(400);
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    fill(host);
    await press(host, "Ver el efecto");
    expect(host.querySelector("form")).toBeNull();
    expect(text(host.querySelector(".effect"))).toContain("Volver a los datos");
  });

  it("sits beside the form from 1024px, and goes away when the form changes", async () => {
    withStyles(1440);
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    expect(text(host.querySelector("aside.effect"))).toContain("El efecto aparece aquí");
    fill(host);
    await press(host, "Ver el efecto");
    expect(host.querySelector("form")).not.toBeNull();
    expect(host.querySelector("section.effect .preview")).not.toBeNull();
    expect(text(host.querySelector(".effect"))).not.toContain("Volver a los datos");

    type(host, "f-amount", "700");
    await settle();
    expect(host.querySelector("section.effect")).toBeNull();
  });
});
