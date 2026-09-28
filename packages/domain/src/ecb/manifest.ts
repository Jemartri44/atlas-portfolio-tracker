// What the jobs and the web read of `reference/ecb/manifest.json` (ADR-0029, third
// amendment, point 2): which file is in force, from which source, and its
// SHA-256. Read strictly: a manifest that does not say it, or names a file
// that is not one of the two of the ECB, gives no history — and a file whose
// bytes do not match its SHA-256 is never used as if it did (`EcbHistoryDamaged`).

import { isPlainObject, strictJsonObject } from "../schema/strict-json.js";
import type { EcbSource } from "./history.js";

export interface ActiveHistory {
  readonly file: "eurofxref-hist.csv" | "api-exr.csv";
  readonly source: EcbSource;
  readonly sha256: string;
}

const FILE_OF: Readonly<Record<EcbSource, ActiveHistory["file"]>> = {
  zip: "eurofxref-hist.csv",
  api: "api-exr.csv",
};

export const activeHistoryOf = (manifestText: string): ActiveHistory | undefined => {
  const active = strictJsonObject(manifestText)?.active;
  if (!isPlainObject(active)) {
    return undefined;
  }
  const { file, source, sha256 } = active;
  return (source === "zip" || source === "api") &&
    file === FILE_OF[source] &&
    typeof sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(sha256)
    ? { file: FILE_OF[source], source, sha256 }
    : undefined;
};
