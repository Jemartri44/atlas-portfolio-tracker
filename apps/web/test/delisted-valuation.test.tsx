// @vitest-environment happy-dom
//
// A delisted asset is deactivated and **still held**: the summary and the
// bucket asked for its valuation, and the valuation form did not let it be
// chosen because it only listed active assets. The total stayed partial for
// ever, with a link that led to a form that could not help.

import { projectLedger } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { FORM_SPECS } from "../src/view-models/forms/index.js";
import { optionsFor } from "../src/view-models/options.js";
import { goldenEvents } from "./helpers/golden.js";
import { choose, optionsOf, settle, show, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("an inactive asset with a position can be valued", () => {
  const state = projectLedger(goldenEvents(), { collectErrors: true });
  const labels = (options: { label: string }[]) => options.map((option) => option.label);

  it("offers a delisted asset that is still held, last and marked, so it can be valued", () => {
    const valuation = FORM_SPECS.find((spec) => spec.slug === "valuation");
    const assetField = valuation?.fields.find((field) => field.name === "asset_id");
    const options = optionsFor(
      "assets",
      { state, date: "2029-01-01", values: { account_id: "acc_bucket" } },
      assetField,
    );
    expect(options.at(-1)?.label).toBe("Alpha Spin-off");
    expect(options.at(-1)?.hint).toContain("dado de baja");
    // A core account does not hold it, so there it is not offered.
    const core = optionsFor(
      "assets",
      { state, date: "2029-01-01", values: { account_id: "acc_mi" } },
      assetField,
    );
    expect(labels(core)).not.toContain("Alpha Spin-off");
  });

  it("the valuation form lets a delisted asset still held be chosen", async () => {
    const host = await show("/registrar/valuation", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_bucket");
    await settle();
    const bucket = optionsOf(host, "f-asset_id");
    expect(bucket.at(-1)).toContain("Alpha Spin-off");
    expect(bucket.at(-1)).toContain("dado de baja");
  });
});
