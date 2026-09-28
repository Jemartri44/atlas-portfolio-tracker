// A view of the bucket that reaches only some prefixes, for reading (review of
// PR #109, avisos N3): the fiscal warnings of January get one over `ledger/`
// and `reference/ecb/`, so no close of `prices/` can reach them — whatever a
// later change writes in their module, the store refuses it. The role of the
// mail function can read `prices/` (the weekly review needs it); this view is
// what keeps the fiscal path from it. It never writes.

import type { ObjectStore } from "@atlas/adapters/aws";

export class OutsideScope extends Error {
  override readonly name = "OutsideScope";
  constructor() {
    super("outside the scope of this task");
  }
}

export const scopedObjects = (objects: ObjectStore, prefixes: readonly string[]): ObjectStore => {
  const within = (key: string): string => {
    if (!prefixes.some((prefix) => key.startsWith(prefix)) || key.split("/").includes("..")) {
      throw new OutsideScope();
    }
    return key;
  };
  return {
    get: async (key) => objects.get(within(key)),
    list: async (prefix) => objects.list(within(prefix)),
    putIfNoneMatch: async () => {
      throw new OutsideScope();
    },
    putIfMatch: async () => {
      throw new OutsideScope();
    },
  };
};
