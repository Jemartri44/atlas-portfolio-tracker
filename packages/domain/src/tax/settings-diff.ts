// What the report would say under the previous settings, for the warning of a
// settings change.

import type { Ulid } from "../ids/ulid.js";
import type { LedgerEvent } from "../schema/events.js";
import { DEFAULT_SETTINGS } from "../settings/settings.js";
import { isInvalid, isUnsupported, type TaxOptions } from "./chain.js";
import { type Core, tryComputeCore } from "./core.js";
import type { SettingsDiff } from "./report.js";
import { lineKey } from "./shared.js";

// --- The previous settings ----------------------------------------------

export const settingsDiff = (
  core: Core,
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): SettingsDiff | undefined => {
  const history = core.state.settingsHistory;
  if (history.length === 0) {
    return undefined;
  }
  const previous = history.length > 1 ? history[history.length - 2] : undefined;
  const other = tryComputeCore(events, year, options, previous?.settings ?? DEFAULT_SETTINGS);
  const currentOrigin = (history[history.length - 1] as { event_id: Ulid }).event_id;
  const previousOrigin = previous === undefined ? "default" : previous.event_id;
  // The equivalent of `invalid_before` for the other way a reading can fail:
  // under the previous settings the chain would start before the first
  // supported year, so there is no figure to compare either.
  if (isUnsupported(other)) {
    return {
      previous_origin: previousOrigin,
      current_origin: currentOrigin,
      base_after_eur: core.compensation.base_eur,
      unsupported_before: true,
      changes: [],
    };
  }
  if (isInvalid(other)) {
    return {
      previous_origin: previousOrigin,
      current_origin: currentOrigin,
      base_after_eur: core.compensation.base_eur,
      invalid_before: other.invalid.length,
      changes: [],
    };
  }
  const before = new Map(other.transmissions.map((line) => [lineKey(line), line]));
  const after = new Map(core.transmissions.map((line) => [lineKey(line), line]));
  const changes: SettingsDiff["changes"] = [];
  for (const [key, line] of after) {
    const was = before.get(key);
    if (was === undefined) {
      changes.push({ event_id: line.event_id, what: "entered" });
    } else if (was.category !== line.category) {
      changes.push({
        event_id: line.event_id,
        what: "category",
        before: was.category,
        after: line.category,
      });
    } else if (!was.computable_eur_rounded.eq(line.computable_eur_rounded)) {
      changes.push({
        event_id: line.event_id,
        what: "computable",
        before: was.computable_eur_rounded.amount.toString(),
        after: line.computable_eur_rounded.amount.toString(),
      });
    }
  }
  for (const [key, line] of before) {
    if (!after.has(key)) {
      changes.push({ event_id: line.event_id, what: "left" });
    }
  }
  return {
    previous_origin: previousOrigin,
    current_origin: currentOrigin,
    base_before_eur: other.compensation.base_eur,
    base_after_eur: core.compensation.base_eur,
    changes,
  };
};
