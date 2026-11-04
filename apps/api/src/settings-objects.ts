// The routes of the objects the owner edits outside the ledger (`docs/api.md` §6.2): the exposure
// per asset (`settings/exposure.json`) and the assumptions of the projection
// (`settings/projection.json`). They decide nothing about the content: that is the domain's
// validator. The ETag is the SHA-256 of the bytes, as the ledger's (§5.1); S3 only sees the
// conditional write, with its own ETag taken from the same read.

import type { SettingsObject } from "@atlas/adapters/aws";
import { sha256Hex, utf8Encode, ValidationError } from "@atlas/domain";
import {
  exposureText,
  MAX_EXPOSURE_BYTES,
  MAX_PROJECTION_BYTES,
  parseExposureText,
  parseProjectionText,
  projectionText,
} from "@atlas/domain/portfolio";
import { refusal } from "./access/codes.js";
import { requestedEtag } from "./access/sync-routes.js";
import { fail, type Outcome } from "./outcome.js";
import { bytes, json } from "./respond.js";

interface SettingsRules {
  readonly object: SettingsObject;
  readonly maxBytes: number;
  /** The text to store, or the domain's `ValidationError`. */
  readonly canonical: (text: string) => string;
  readonly readCode: string;
  readonly writtenCode: string;
}

export interface SettingsWrite {
  readonly ifMatch: string | undefined;
  readonly ifNoneMatch: string | undefined;
  /** The body as it came, to see a key twice. */
  readonly text: string;
  readonly bytes: number;
}

const settingsRoutes = ({ object, maxBytes, canonical, readCode, writtenCode }: SettingsRules) => {
  /** `GET` (§6.2): the stored bytes as they are, with their ETag; not read, not judged. */
  const read = async (): Promise<Outcome> => {
    const stored = await object.read();
    if (stored === undefined) {
      return fail(refusal("not_found", { reason: "missing" }));
    }
    return {
      result: bytes(200, stored.body, {
        "content-type": "application/json; charset=utf-8",
        etag: `"${sha256Hex(stored.body)}"`,
      }),
      code: readCode,
    };
  };

  /** `PUT` (§6.2): the whole object, created once or replaced on the version read. */
  const write = async (input: SettingsWrite): Promise<Outcome> => {
    const creating = input.ifNoneMatch === "*";
    if (input.ifMatch !== undefined && input.ifNoneMatch !== undefined) {
      return fail(refusal("body_invalid", { reason: "preconditions" }));
    }
    if (input.ifMatch === undefined && !creating) {
      return fail(refusal("precondition_required"));
    }
    if (input.bytes > maxBytes) {
      return fail(refusal("body_too_large", { limit: maxBytes }));
    }
    let stored: Uint8Array;
    try {
      stored = utf8Encode(canonical(input.text));
    } catch (error) {
      if (error instanceof ValidationError) {
        // `reason`, and whatever else the validator says of where.
        return fail(refusal("body_invalid", error.details));
      }
      throw error;
    }
    const current = await object.read();
    let written: "written" | "created" | "stale";
    if (creating) {
      written =
        current === undefined && (await object.create(stored)) === "created" ? "created" : "stale";
    } else {
      const asked = requestedEtag(input.ifMatch) as { etag: string };
      written =
        current !== undefined &&
        asked.etag === sha256Hex(current.body) &&
        (await object.replace(stored, current.etag)) === "written"
          ? "written"
          : "stale";
    }
    if (written === "stale") {
      return fail(refusal("precondition_failed"));
    }
    return {
      result: json(200, { etag: sha256Hex(stored) }, { etag: `"${sha256Hex(stored)}"` }),
      code: writtenCode,
    };
  };

  return { read, write };
};

export const exposureRoutes = (object: SettingsObject) =>
  settingsRoutes({
    object,
    maxBytes: MAX_EXPOSURE_BYTES,
    canonical: (text) => exposureText(parseExposureText(text)),
    readCode: "exposure_read",
    writtenCode: "exposure_written",
  });

export const projectionRoutes = (object: SettingsObject) =>
  settingsRoutes({
    object,
    maxBytes: MAX_PROJECTION_BYTES,
    canonical: (text) => projectionText(parseProjectionText(text)),
    readCode: "projection_read",
    writtenCode: "projection_written",
  });
