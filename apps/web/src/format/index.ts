// Presentation formatting. `money.ts` is **not** re-exported here on purpose:
// it is the privacy gate and only `components/Amount.tsx` may import it
// (tests/architecture.test.ts enforces it).

export { daysSince, formatAge, formatDate, formatInstantDate, formatLongDate } from "./date.js";
export {
  EVENT_LABELS,
  eventLabel,
  FIELD_LABELS,
  fieldLabel,
  STATUS_LABELS,
  VALUE_LABELS,
  valueLabel,
} from "./labels.js";
export { describeError, ERROR_MESSAGES } from "./messages/errors.js";
export { describeWarning, WARNING_MESSAGES } from "./messages/warnings.js";
export {
  displayName,
  displayNames,
  NAMED_ID_FIELDS,
  type NameIndex,
  type Naming,
  NO_NAMES,
  nameIndex,
  namingOf,
} from "./names.js";
export {
  formatDecimalString,
  formatPercent,
  formatPoints,
  type NumberFormat,
  roundDecimalString,
  signOf,
} from "./number.js";
