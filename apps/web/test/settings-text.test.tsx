// @vitest-environment happy-dom
//
// A text setting is shown and saved exactly as it is. The decimal comma of a
// figure was applied to every setting: the e-mail read
// «atlas@example,invalid», and editing one letter would have saved the comma
// (a defect of the round of web defects, found on 2026-09-19).

import { DEFAULT_SETTINGS, mergeSettings } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import {
  candidateSettings,
  SETTINGS_TEXTS,
  settingText,
  settingValue,
  withText,
} from "../src/view-models/index.js";
import { show, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("a text setting", () => {
  const current = mergeSettings(DEFAULT_SETTINGS, {
    tax_residence: "E.S",
    deviation_threshold_pp: "2.5",
  });

  it("keeps its points, while a figure takes the comma it is typed with", () => {
    expect(settingText(current, {}, "tax_residence")).toBe("E.S");
    expect(settingValue(current, {}, "deviation_threshold_pp")).toBe("2,5");
    const typed = withText({}, "tax_residence", "E.S.");
    expect(settingText(current, typed, "tax_residence")).toBe("E.S.");
  });

  it("reaches the field of the configuration as it is, and is typed as it is", async () => {
    const host = await show("/ajustes/configuracion", Configuracion);
    const field = host.querySelector("#s-tax_residence") as HTMLInputElement;
    type(host, "s-tax_residence", "E.S.");
    expect(field.value).toBe("E.S.");
  });
});

describe("notification_email (feature 016, E3; §8.1 P12, §8.2 M7)", () => {
  it("is no longer offered by Ajustes", async () => {
    expect(SETTINGS_TEXTS.map((setting) => setting.key)).not.toContain("notification_email");
    const host = await show("/ajustes/configuracion", Configuracion);
    expect(host.querySelector("#s-notification_email")).toBeNull();
    expect(host.textContent).not.toContain("Correo de avisos");
  });

  it("never reaches a new snapshot, even when the golden ledger carries it", () => {
    const withEmail = { ...DEFAULT_SETTINGS, notification_email: "atlas@example.invalid" };
    expect("notification_email" in candidateSettings(withEmail, {}, undefined)).toBe(false);
  });
});
