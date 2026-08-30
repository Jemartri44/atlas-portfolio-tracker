// Settings history (data-schema.md §5, §6.1): `settingsAt(date)` is the last
// `settings_changed` whose `recorded_at`, as a Europe/Madrid date, is <= date.

import type { CivilDate } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import type { SettingsChangedEvent } from "../schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../settings/settings.js";
import type { LedgerState, SettingsEntry } from "./state.js";

export const applySettingsChanged = (state: LedgerState, event: SettingsChangedEvent): void => {
  state.settingsHistory.push({
    event_id: event.id,
    recorded_at: event.recorded_at,
    madrid_date: madridDateOf(event.recorded_at),
    settings: event.settings,
  });
};

export interface SettingsResolution {
  settings: Settings;
  /** Id of the `settings_changed` in force, or "default". */
  origin: string;
}

export const settingsAt = (state: LedgerState, date: CivilDate): SettingsResolution => {
  let found: SettingsEntry | undefined;
  for (const entry of state.settingsHistory) {
    if (entry.madrid_date <= date) {
      found = entry;
    }
  }
  return found === undefined
    ? { settings: DEFAULT_SETTINGS, origin: "default" }
    : { settings: found.settings, origin: found.event_id };
};

/** Settings used to derive fiscal dates: an explicit override, else the latest change, else the defaults (Q3). */
export const resolveFiscalSettings = (
  history: readonly SettingsEntry[],
  override?: Settings,
): Settings => {
  if (override !== undefined) {
    return override;
  }
  const last = history[history.length - 1];
  return last === undefined ? DEFAULT_SETTINGS : last.settings;
};
