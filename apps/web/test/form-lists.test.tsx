// @vitest-environment happy-dom
//
// The lists of a form follow what has been chosen: a core account offered
// shares of the bucket, a thesis offered funds of the core, and the target
// weights were asked for assets given up.

import { projectLedger } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { selectOptions, withoutStale } from "../src/view-models/forms/choices.js";
import { FORM_SPECS } from "../src/view-models/forms/index.js";
import { assetOptions, optionsFor } from "../src/view-models/options.js";
import { goldenEvents } from "./helpers/golden.js";
import {
  choose,
  openLedger,
  optionsOf,
  settle,
  show,
  text,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

/** A catalogue with a core asset given up: one with its weight still in force, one without. */
const retired = (weighted: boolean): string =>
  [
    {
      schema_version: 1,
      id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
      recorded_at: "2026-01-02T10:00:00.000Z",
      type: "settings_changed",
      settings: {
        fiscal_date_rule: {},
        wash_sale_window: {},
        target_weights: weighted ? { ast_world: "90", ast_old: "10" } : { ast_world: "100" },
      },
    },
    ...[
      ["ast_world", "World Index Fund", true],
      ["ast_old", "Fondo retirado", false],
    ].map(([asset_id, name, active], index) => ({
      schema_version: 1,
      id: `01AAAAAAAAAAAAAAAAAAAAAAB${index}`,
      recorded_at: "2026-01-02T10:00:01.000Z",
      type: "asset_created",
      asset_id,
      asset_type: "fund",
      book: "core",
      asset_class: "equity",
      name,
      currency: "EUR",
      transferable: true,
      active,
    })),
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");

describe("the lists, as data", () => {
  const state = projectLedger(goldenEvents(), { collectErrors: true });
  const labels = (options: { label: string }[]) => options.map((option) => option.label);

  it("narrows the assets to the book of the chosen account", () => {
    const core = assetOptions(state, { book: "core" });
    const bucket = assetOptions(state, { book: "bucket" });
    expect(labels(core)).toContain("World Index Fund");
    expect(labels(core)).not.toContain("Alpha Robotics");
    expect(labels(bucket)).toContain("Alpha Robotics");
    expect(labels(bucket)).not.toContain("World Index Fund");
  });

  it("never offers an inactive asset with nothing left, except to filter the past", () => {
    const withoutPositions = projectLedger(
      goldenEvents().filter(
        (event) => !["buy", "sell", "corporate_action", "transfer", "swap"].includes(event.type),
      ),
      { collectErrors: true },
    );
    expect(labels(assetOptions(withoutPositions, { heldIn: true }))).not.toContain(
      "Alpha Spin-off",
    );
    expect(labels(assetOptions(withoutPositions, { inactive: true }))).toContain("Alpha Spin-off");
  });

  it("offers only bucket assets to a thesis", () => {
    const tesis = FORM_SPECS.find((spec) => spec.slug === "tesis");
    const field = tesis?.fields.find((entry) => entry.name === "asset_id");
    const options = optionsFor(
      field?.options ?? "assets",
      { state, date: "2029-01-01", values: {} },
      field,
    );
    expect(labels(options)).not.toContain("World Index Fund");
    expect(labels(options)).toContain("Delta Materials");
  });

  it("empties a choice the new account does not allow", () => {
    const buy = FORM_SPECS.find((spec) => spec.slug === "buy");
    const next = withoutStale(
      buy?.fields ?? [],
      state,
      { account_id: "acc_bucket", asset_id: "ast_world" },
      "2029-01-01",
      "account_id",
    );
    expect(next.asset_id).toBe("");
    const kept = withoutStale(
      buy?.fields ?? [],
      state,
      { account_id: "acc_mi", asset_id: "ast_world" },
      "2029-01-01",
      "account_id",
    );
    expect(kept.asset_id).toBe("ast_world");
  });

  /**
   * Correcting the sale of a fund given up since then: the fund is inactive and
   * no longer held, so no list offers it — but the form already holds it, and
   * typing the amount must not empty it, nor may the list hide it.
   */
  it("keeps the asset a correction already holds, and only reacts to the account", () => {
    const buy = FORM_SPECS.find((spec) => spec.slug === "buy");
    const fields = buy?.fields ?? [];
    const asset = fields.find((field) => field.name === "asset_id");
    const values = { account_id: "acc_bucket", asset_id: "ast_alpha_spin", amount: "10" };
    const withoutPositions = projectLedger(
      goldenEvents().filter(
        (event) => !["buy", "sell", "corporate_action", "transfer", "swap"].includes(event.type),
      ),
      { collectErrors: true },
    );
    expect(withoutStale(fields, withoutPositions, values, "2029-01-01", "amount")).toEqual(values);
    expect(labels(selectOptions(asset as never, withoutPositions, values, "2029-01-01"))).toContain(
      "Alpha Spin-off",
    );
  });
});

describe("the lists, on the forms", () => {
  it("the valuation form keeps the books apart", async () => {
    const host = await show("/registrar/valuation", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_bucket");
    await settle();
    expect(optionsOf(host, "f-asset_id").join()).not.toContain("World Index Fund");

    choose(host, "f-account_id", "acc_mi");
    await settle();
    const core = optionsOf(host, "f-asset_id");
    expect(core.join()).toContain("World Index Fund");
    expect(core.join()).not.toContain("Alpha Robotics");
  });

  it("offers a thesis only the assets of the bucket", async () => {
    const host = await show("/registrar/tesis", RegistrarForm, "/registrar/:tipo");
    const assets = optionsOf(host, "f-asset_id").join();
    expect(assets).toContain("Delta Materials");
    expect(assets).not.toContain("World Index Fund");
  });

  it("leaves out an asset given up, unless it still carries a weight to take away", async () => {
    await openLedger(retired(false));
    const clean = text(await show("/ajustes/configuracion", Configuracion));
    expect(clean).toContain("World Index Fund (%)");
    expect(clean).not.toContain("Fondo retirado (%)");

    await openLedger(retired(true));
    const host = await show("/ajustes/configuracion", Configuracion);
    const field = host.querySelector("#w-ast_old")?.closest(".field");
    expect(text(field)).toContain("Dado de baja");
  });
});
