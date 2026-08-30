import { describe, expect, it } from "vitest";
import {
  applySettingsChanged,
  resolveFiscalSettings,
  settingsAt,
} from "../../src/projections/settings-at.js";
import { createEmptyState } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { ID, SAMPLES } from "../samples.js";

const flipped = mergeSettings(DEFAULT_SETTINGS, {
  fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, etc: "value_date" },
});

describe("settingsAt", () => {
  it("returns the last change up to the end of the Madrid day, else the defaults", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    applySettingsChanged(state, SAMPLES.settings_changed);
    applySettingsChanged(state, {
      ...SAMPLES.settings_changed,
      id: ID.settings.replace("FA4", "FB4"),
      recorded_at: "2026-09-10T22:30:00Z",
      settings: flipped,
    });
    expect(settingsAt(state, "2026-08-31")).toEqual({
      settings: DEFAULT_SETTINGS,
      origin: "default",
    });
    expect(settingsAt(state, "2026-09-01").origin).toBe(ID.settings);
    expect(settingsAt(state, "2026-09-10").origin).toBe(ID.settings);
    expect(settingsAt(state, "2026-09-11").settings.fiscal_date_rule.etc).toBe("value_date");
    expect(state.settingsHistory[1]?.madrid_date).toBe("2026-09-11");
  });
});

describe("resolveFiscalSettings", () => {
  it("prefers the override, then the latest entry, then the defaults", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    expect(resolveFiscalSettings(state.settingsHistory)).toBe(DEFAULT_SETTINGS);
    applySettingsChanged(state, { ...SAMPLES.settings_changed, settings: flipped });
    expect(resolveFiscalSettings(state.settingsHistory)).toBe(flipped);
    expect(resolveFiscalSettings(state.settingsHistory, DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS);
  });
});
