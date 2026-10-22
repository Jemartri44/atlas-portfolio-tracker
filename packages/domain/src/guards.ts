export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A count: a safe integer, zero or more. */
export const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Whether the object has no key outside the list. */
export const onlyKeys = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean => Object.keys(value).every((key) => keys.includes(key));

/** A SHA-256 as lower-case hexadecimal. */
export const SHA256_HEX = /^[0-9a-f]{64}$/;

/** An ISO 8601 UTC instant, with up to three decimals of second. */
export const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
