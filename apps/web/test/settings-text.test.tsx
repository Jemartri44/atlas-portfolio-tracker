// @vitest-environment happy-dom
//
// A text setting is shown and saved exactly as it is. The decimal comma of a
// figure was applied to every setting: the e-mail read
// «atlas@example,invalid», and editing one letter would have saved the comma
// (a defect of the round of web defects, found on 2026-09-19).

import { DEFAULT_SETTINGS, mergeSettings } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import { settingText, settingValue, withText } from "../src/view-models/index.js";
import { show, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("a text setting", () => {
  const current = mergeSettings(DEFAULT_SETTINGS, {
    notification_email: "atlas@example.invalid",
    deviation_threshold_pp: "2.5",
  });

  it("keeps its points, while a figure takes the comma it is typed with", () => {
    expect(settingText(current, {}, "notification_email")).toBe("atlas@example.invalid");
    expect(settingValue(current, {}, "deviation_threshold_pp")).toBe("2,5");
    const typed = withText({}, "notification_email", "yo@example.invalid");
    expect(settingText(current, typed, "notification_email")).toBe("yo@example.invalid");
  });

  it("reaches the field of the configuration as it is, and is typed as it is", async () => {
    const host = await show("/ajustes/configuracion", Configuracion);
    const field = host.querySelector("#s-notification_email") as HTMLInputElement;
    expect(field.value).toBe("atlas@example.invalid");
    type(host, "s-notification_email", "atlas@example.invalid.");
    expect(field.value).toBe("atlas@example.invalid.");
  });
});
