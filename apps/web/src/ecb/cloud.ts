// The web of the phone downloads the ECB history **from the cloud** (feature
// 016, E3, block 2; 015, §7 P12): a third origin, next to the linked folder
// and the copy imported by hand. With the session of this browser it reads
// `manifest.json` from our own API — `If-None-Match` on the version it holds
// — and the file in force, **checks its SHA-256 against the manifest**, and
// keeps it as the imported copy is kept, marked as from the cloud. A file
// that does not match is **not used**, and said; one that changes a rate the
// copy held already is **not kept** (ADR-0029, point 2), as with an import.
//
// **Only when the user asks or opens the card of the ECB**: nothing here runs
// at start or on a timer (mutant 25). It travels in the lazy section of
// Ajustes, next to the card that calls it; what is heavy — the ECB, the store
// of the browser, the history of the web — comes in only when it runs, so
// neither the boot nor the section grows by more than this file (§8.1 P13).
// The CSP does not change: it is our own origin.

import { httpReference } from "@atlas/adapters/reference-http";
import { sha256Hex } from "@atlas/domain";
import type { EcbSource } from "@atlas/domain/ecb";
import { RemoteError } from "@atlas/domain/sync";

export type CloudOutcome =
  | { readonly kind: "saved"; readonly latest: string; readonly source: EcbSource }
  /** The version held is the one in force in the cloud. */
  | { readonly kind: "up_to_date" }
  /** The cloud has no history yet. */
  | { readonly kind: "none" }
  /** Its file is not the one its manifest records, or neither reads: not used. */
  | { readonly kind: "damaged" }
  /** It changes rates the copy held already published: not kept. */
  | { readonly kind: "rejected"; readonly total: number }
  | { readonly kind: "failed"; readonly code: string };

const utf8 = new TextDecoder("utf-8", { fatal: true });

const textOf = (bytes: Uint8Array): string | undefined => {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

/** Downloads the history in force in the cloud, checks it and keeps it. */
export const downloadCloudHistory = async (
  request: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<CloudOutcome> => {
  const [{ importedHistory, saveImportedHistory }, ecb, { reloadWebHistory }] = await Promise.all([
    import("@atlas/adapters/reference"),
    import("@atlas/domain/ecb"),
    import("./history.js"),
  ]);
  const reference = httpReference({ origin: "", fetch: request });
  const held = await importedHistory();
  const fromCloud = held?.origin === "cloud" ? held : undefined;
  try {
    const manifest = await reference.get("ecb", "manifest.json", fromCloud?.manifest_version);
    if (manifest.kind === "missing") {
      return { kind: "none" };
    }
    if (manifest.kind === "not_modified") {
      return { kind: "up_to_date" };
    }
    const manifestText = textOf(manifest.bytes);
    const active = manifestText === undefined ? undefined : ecb.activeHistoryOf(manifestText);
    if (active === undefined) {
      return { kind: "damaged" };
    }
    const file = await reference.get("ecb", active.file);
    // The SHA-256 of the bytes as they came, before anything reads them.
    if (file.kind !== "file" || sha256Hex(file.bytes) !== active.sha256) {
      return { kind: "damaged" };
    }
    const text = ecb.asciiText(file.bytes);
    const next = ecb.readEcbHistory(text, active.source);
    const previous = held === undefined ? undefined : ecb.readEcbHistory(held.text, held.source);
    const check = ecb.checkHistoryUpdate(previous, next);
    if (check.kind === "rejected") {
      return { kind: "rejected", total: check.total };
    }
    await saveImportedHistory({
      text,
      source: active.source,
      file_name: active.file,
      imported_at: now().toISOString(),
      origin: "cloud",
      manifest_version: manifest.version,
    });
    await reloadWebHistory();
    return { kind: "saved", latest: check.latest, source: active.source };
  } catch (error) {
    if (error instanceof RemoteError) {
      return { kind: "failed", code: error.code };
    }
    throw error;
  }
};
