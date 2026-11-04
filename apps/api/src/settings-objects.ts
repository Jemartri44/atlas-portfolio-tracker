// The routes of the exposure the owner declares per asset (`docs/api.md` §6.2). One object,
// `settings/exposure.json`, outside the ledger. They decide nothing about its content: that is the
// domain's `parseExposureText`. The ETag is the SHA-256 of the bytes, as the ledger's (§5.1); S3
// only sees the conditional write, with its own ETag taken from the same read.

import type { ExposureObject } from "@atlas/adapters/aws";
import { sha256Hex, utf8Encode, ValidationError } from "@atlas/domain";
import { exposureText, MAX_EXPOSURE_BYTES, parseExposureText } from "@atlas/domain/portfolio";
import { refusal } from "./access/codes.js";
import { requestedEtag } from "./access/sync-routes.js";
import { fail, type Outcome } from "./outcome.js";
import { bytes, json } from "./respond.js";

export interface ExposureContext {
  readonly object: ExposureObject;
}

export interface ExposureWrite {
  readonly ifMatch: string | undefined;
  readonly ifNoneMatch: string | undefined;
  /** The body as it came, to see a key twice. */
  readonly text: string;
  readonly bytes: number;
}

export const exposureRoutes = ({ object }: ExposureContext) => {
  /** `GET /api/exposure` (§6.2): the stored bytes as they are, with their ETag; not read, not judged. */
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
      code: "exposure_read",
    };
  };

  /** `PUT /api/exposure` (§6.2): the whole object, created once or replaced on the version read. */
  const write = async (input: ExposureWrite): Promise<Outcome> => {
    const creating = input.ifNoneMatch === "*";
    if (input.ifMatch !== undefined && input.ifNoneMatch !== undefined) {
      return fail(refusal("body_invalid", { reason: "preconditions" }));
    }
    if (input.ifMatch === undefined && !creating) {
      return fail(refusal("precondition_required"));
    }
    if (input.bytes > MAX_EXPOSURE_BYTES) {
      return fail(refusal("body_too_large", { limit: MAX_EXPOSURE_BYTES }));
    }
    let canonical: Uint8Array;
    try {
      canonical = utf8Encode(exposureText(parseExposureText(input.text)));
    } catch (error) {
      if (error instanceof ValidationError) {
        // `reason`, and for a split that does not add up `asset_id`, `dimension` and `total`.
        return fail(refusal("body_invalid", error.details));
      }
      throw error;
    }
    const current = await object.read();
    let written: "written" | "created" | "stale";
    if (creating) {
      written =
        current === undefined && (await object.create(canonical)) === "created"
          ? "created"
          : "stale";
    } else {
      const asked = requestedEtag(input.ifMatch) as { etag: string };
      written =
        current !== undefined &&
        asked.etag === sha256Hex(current.body) &&
        (await object.replace(canonical, current.etag)) === "written"
          ? "written"
          : "stale";
    }
    if (written === "stale") {
      return fail(refusal("precondition_failed"));
    }
    return {
      result: json(200, { etag: sha256Hex(canonical) }, { etag: `"${sha256Hex(canonical)}"` }),
      code: "exposure_written",
    };
  };

  return { read, write };
};
