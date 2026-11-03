// The contract between the one catalogue of messages and the two surfaces that speak them.
//
// A message is written once, in terms of a `Voice`. The console and the web each hand in their own:
// the web resolves ids to names, formats dates and numbers its way and masks amounts and quantities
// in privacy mode; the console prints ids and raw figures. **A message never formats a figure or a
// name by itself** (a test holds it): the voice is the only door, which is what keeps the mask of
// the web on every sentence.
//
// What belongs to one surface only (the command to run, the screen to open) is a remedy of the
// entry, appended after the shared sentence.

export type Details = Readonly<Record<string, unknown>>;

export type Surface = "cli" | "web";

export interface Voice {
  readonly surface: Surface;
  /** A detail as text, as it is: a string unchanged, anything else as JSON, missing as «sin dato». */
  text: (value: unknown) => string;
  /** One account or asset: its name on the web, its id in the console. */
  one: (id: unknown) => string;
  /** A list of them, comma separated. */
  many: (ids: unknown) => string;
  /** A thesis. */
  thesis: (id: unknown) => string;
  /** An amount in euros: formatted, or masked in privacy mode. */
  money: (value: unknown) => string;
  /** A quantity of units: formatted, or masked. */
  quantity: (value: unknown) => string;
  /** A quantity of securities with its word («3 títulos»). */
  titles: (value: unknown) => string;
  /** A message of the domain quoted inside ours, with its figures masked when they must be. */
  evidence: (value: unknown) => string;
  /** A civil date. */
  date: (value: unknown) => string;
  /** A plain number that is not money: a ratio, a threshold, a bound, a year. */
  num: (value: unknown) => string;
  /** A percentage the domain wrote as `30.2`. */
  pct: (value: unknown) => string;
  /** Percentage points with their sign. */
  pp: (value: unknown) => string;
  /** A field of an event by the name the surface gives it. */
  field: (value: unknown) => string;
  /** The alternatives of an either-or rule. */
  fields: (value: unknown) => string;
  /** An event type as a noun inside a sentence («una compra»). */
  kind: (value: unknown) => string;
  /** A value of an enumeration in words. */
  word: (value: unknown) => string;
  /** A setting by the name the surface gives it. */
  setting: (value: unknown) => string;
  /** A number of days: «1 día», «12 días». */
  days: (value: unknown) => string;
  /** The length of a detail that is a list. */
  count: (value: unknown) => number;
}

/** What an entry says: a sentence from the details, the voice and the message of the domain. */
export type Say = (d: Details, v: Voice, message: string) => string;

/**
 * One code of the catalogue: the shared sentence, and what only one surface adds after it. A bare
 * function is an entry with no remedy.
 */
export type Entry = Say | { say: Say; cli?: Say; web?: Say };

/** The sentence of an entry for a surface; the remedy follows after a space. */
export const render = (entry: Entry, d: Details, v: Voice, message: string): string => {
  if (typeof entry === "function") {
    return entry(d, v, message);
  }
  const remedy = entry[v.surface]?.(d, v, message);
  const said = entry.say(d, v, message);
  return remedy === undefined || remedy === "" ? said : `${said} ${remedy}`;
};
