// The allow list of `{sub, email}` (ADR-0027), read from SSM on every request
// with its short cache. **Both, together, in one entry**: a `sub` of one entry
// with the e-mail of another is not in the list. The e-mail is compared
// **exactly** (decision of 2026-09-25): normalising it would be recognising
// by resemblance (§2 ter).

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import { isSubject } from "./signed.js";

export interface AllowEntry {
  readonly sub: string;
  readonly email: string;
}

const unreadable = (reason: string): ValidationError =>
  new ValidationError("allow_list_unreadable", `the allow list cannot be read: ${reason}`, {
    reason,
  });

/** `{"allow_list_format":1,"entries":[{"sub","email"}]}`, strict. Unreadable lets nobody in. */
export const parseAllowList = (text: string): readonly AllowEntry[] => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw unreadable("json");
  }
  if (
    !isRecord(value) ||
    value.allow_list_format !== 1 ||
    !Array.isArray(value.entries) ||
    Object.keys(value).some((key) => key !== "allow_list_format" && key !== "entries")
  ) {
    throw unreadable("shape");
  }
  return value.entries.map((entry: unknown) => {
    if (
      !isRecord(entry) ||
      !isSubject(entry.sub) ||
      typeof entry.email !== "string" ||
      entry.email.length === 0 ||
      Object.keys(entry).length !== 2
    ) {
      throw unreadable("entry");
    }
    return { sub: entry.sub, email: entry.email };
  });
};

export const isAllowed = (entries: readonly AllowEntry[], pair: AllowEntry): boolean =>
  entries.some((entry) => entry.sub === pair.sub && entry.email === pair.email);
