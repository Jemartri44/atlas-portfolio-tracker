// The ECB history of the bucket as the jobs read it (feature 016): its
// manifest and the file in force, read **only** through the `ReferenceReader`
// of the 015, and the file used **only if its bytes are the ones its manifest
// records** — never as if they were (`EcbHistoryDamaged`). Nothing of
// `prices/`: the income tax of January reads this (the notes of the ECB check,
// as `atlas tax` does) and must not reach a price (E4; `tests/jobs-access.test.ts`).

import { createHash } from "node:crypto";
import { type ObjectStore, referenceReader } from "@atlas/adapters/aws";
import { type EcbHistory, readEcbHistory } from "@atlas/domain/ecb";
import { activeHistoryOf } from "@atlas/domain/jobs";

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export const textOf = (bytes: Uint8Array): string | undefined => {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

/** The history in force, or nothing: no manifest, a file that does not match it, or not a history. */
export const readCloudEcbHistory = async (
  objects: ObjectStore,
): Promise<EcbHistory | undefined> => {
  const reader = referenceReader(objects);
  const manifest = await reader.get("reference/ecb/manifest.json");
  const active = manifest === undefined ? undefined : activeHistoryOf(textOf(manifest.body) ?? "");
  if (active === undefined) {
    return undefined;
  }
  const file = await reader.get(`reference/ecb/${active.file}`);
  if (
    file === undefined ||
    createHash("sha256").update(file.body).digest("hex") !== active.sha256
  ) {
    return undefined;
  }
  const text = textOf(file.body);
  return text === undefined ? undefined : readEcbHistory(text, active.source);
};
