// JSON with its numbers **as the text they arrived with** (decision D-Q1 of
// the direction). EODHD gives a close as a JSON number, and `JSON.parse`
// alone would turn `325.13` into the nearest double: a float, which the
// project never lets near an amount (trap 3, ADR-0005). The reviver of
// `JSON.parse` receives the source text of every primitive in its third
// argument (`context.source`, Node 22); every number is replaced by it.
//
// **If that argument does not exist** where this runs, it stops with an
// error of its own: a number is never read as a float instead.

/** A JSON number, as the text it arrived with: never a float. */
export class JsonNumber {
  constructor(readonly text: string) {}
}

/** The runtime cannot give the text of a JSON number: nothing is read. */
export class ExactJsonUnsupported extends Error {
  constructor() {
    super("this runtime cannot read the text of a JSON number (JSON.parse context.source)");
    this.name = "ExactJsonUnsupported";
  }
}

type Reviver = (
  this: unknown,
  key: string,
  value: unknown,
  context?: { source?: string },
) => unknown;
type Parse = (text: string, reviver: Reviver) => unknown;

/** Parses `text`, every number as a `JsonNumber` with its source text. Throws `SyntaxError` on bad JSON. */
export const parseExactJson = (
  text: string,
  parse: Parse = JSON.parse as unknown as Parse,
): unknown =>
  parse(text, (_key, value, context) => {
    if (typeof value !== "number") {
      return value;
    }
    if (typeof context?.source !== "string") {
      throw new ExactJsonUnsupported();
    }
    return new JsonNumber(context.source);
  });
