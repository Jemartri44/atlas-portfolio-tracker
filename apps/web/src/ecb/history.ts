// Where the web gets the ECB history (ADR-0029, point 3; ADR-0035).
//
// **The web downloads nothing from a third party and keeps nothing on the device.** With the
// session of this browser it reads `manifest.json` and the file in force from our own API, checks
// the file's SHA-256 against the manifest, and holds the history in memory for the life of the
// page. Without one there is no history: nothing is proposed, and the rates are typed as always.
//
// Everything here is loaded lazily: nothing of the ECB is on the boot path, and the build fails if
// it ever is.

import { httpReference } from "@atlas/adapters/reference-http";
import { DomainError, sha256Hex } from "@atlas/domain";
import {
  activeHistoryOf,
  asciiText,
  DEFAULT_LOCAL_CONFIG,
  type EcbHistory,
  type EcbSource,
  latestPublication,
  readEcbHistory,
} from "@atlas/domain/ecb";
import { RemoteError } from "@atlas/domain/remote-answers";

export interface WebHistory {
  history?: EcbHistory;
  source?: EcbSource;
  /** The last day it publishes. */
  latest?: string;
  /** When it was read from the cloud. */
  when?: string;
  /** The threshold of a currency the ECB stopped publishing (the default of the domain). */
  staleDays: number;
  /**
   * Why no history could be read where one may be: the cloud did not answer (`unavailable`, with
   * the `code` of the failure), or its file is not the one its manifest records or does not read
   * (`unreadable`). Said, never swallowed.
   */
  problem?: "unavailable" | "unreadable";
  code?: string;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

const none = (): WebHistory => ({ staleDays: DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days });

const textOf = (bytes: Uint8Array): string | undefined => {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

/** Reads the history in force in the cloud; a file that does not match its manifest is not used. */
const fromCloud = async (request: typeof fetch, now: Date): Promise<WebHistory> => {
  const staleDays = DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days;
  const reference = httpReference({ origin: "", fetch: request });
  try {
    const manifest = await reference.get("ecb", "manifest.json");
    if (manifest.kind !== "file") {
      return none();
    }
    const manifestText = textOf(manifest.bytes);
    const active = manifestText === undefined ? undefined : activeHistoryOf(manifestText);
    if (active === undefined) {
      return { staleDays, problem: "unreadable" };
    }
    const file = await reference.get("ecb", active.file);
    // The SHA-256 of the bytes as they came, before anything reads them.
    if (file.kind !== "file" || sha256Hex(file.bytes) !== active.sha256) {
      return { staleDays, problem: "unreadable" };
    }
    const history = readEcbHistory(asciiText(file.bytes), active.source);
    return {
      history,
      source: active.source,
      latest: latestPublication(history),
      when: now.toISOString(),
      staleDays,
    };
  } catch (error) {
    // The cloud's answer (a `RemoteError`) is one thing; a manifest or file that came and does not
    // read is another.
    if (error instanceof RemoteError) {
      return { staleDays, problem: "unavailable", code: error.code };
    }
    if (error instanceof DomainError) {
      return { staleDays, problem: "unreadable", code: error.code };
    }
    throw error;
  }
};

let cached: Promise<WebHistory> | undefined;

/**
 * The history in force for the web: read from the cloud once per page and held in memory. A cloud
 * that did not answer is not held: the next call asks again.
 */
export const loadWebHistory = (
  request: typeof fetch = (...args) => fetch(...args),
): Promise<WebHistory> => {
  if (cached === undefined) {
    const reading: Promise<WebHistory> = fromCloud(request, new Date()).then(
      (web) => {
        // Only a clean answer is held; a failure, a half-rotated file or a damaged one is asked
        // again next time. The identity check keeps a late answer from erasing a newer reading.
        if (web.problem !== undefined && cached === reading) {
          cached = undefined;
        }
        return web;
      },
      (error: unknown) => {
        if (cached === reading) {
          cached = undefined;
        }
        throw error;
      },
    );
    cached = reading;
  }
  return cached;
};

/** Forgets what was read — a new download, or the end of the session. */
export const reloadWebHistory = (request?: typeof fetch): Promise<WebHistory> => {
  cached = undefined;
  return loadWebHistory(request);
};

/** Drops the history held in memory without reading again (the session is over). */
export const forgetWebHistory = (): void => {
  cached = undefined;
};
