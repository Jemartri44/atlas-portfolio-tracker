// The routes of the sync and of the reference data (`docs/api.md` §5 and §6). They decide nothing:
// what a line is worth is the domain's `acceptAppend`, what a name of the
// reference data may be is `referenceKey`. The remote ledger is reached only through
// `AppendOnlyLedger`: read and append, never rewrite, never delete.

import { type AppendOnlyLedger, decodeUtf8Strict, type ReferenceReader } from "@atlas/adapters/aws";
import { ConflictError, CURRENT_LEDGER_SCHEMA, sha256Hex, utf8Encode } from "@atlas/domain";
import {
  type ApiConfig,
  type ApiRefusal,
  ifNoneMatchHits,
  type ReferenceKind,
  referenceContentType,
  referenceIndex,
  referenceKey,
  refusal,
  refusalOfRemote,
  requestedEtag,
  versionOf,
} from "@atlas/domain/access";
import { unservableSymbols } from "@atlas/domain/quotes";
import {
  acceptAppend,
  linesOfText,
  parseAppendBody,
  RemoteError,
  type RemoteRules,
  textOfLines,
} from "@atlas/domain/sync";
import { fail, type Outcome } from "./outcome.js";
import { bytesCompressed, json, notModified } from "./respond.js";

export interface SyncContext {
  readonly config: ApiConfig;
  readonly ledger: AppendOnlyLedger;
  /** The reference data, read only, its two prefixes and nothing else. */
  readonly reference: ReferenceReader;
  readonly now: () => Date;
}

/**
 * The bytes the lines make, **only if they are UTF-8**: the domain refuses a lone surrogate before
 * judging a line, and this is the last check before S3, so that the remote can never be left in
 * bytes no device can read.
 */
export const utf8Of = (lines: readonly string[]): Uint8Array | undefined => {
  const bytes = utf8Encode(textOfLines(lines));
  try {
    decodeUtf8Strict(bytes, false);
  } catch {
    return undefined;
  }
  return bytes;
};

/** A rule of the domain that said no, with its own code; anything else goes on up. */
const judged = <T>(run: () => T): T | ApiRefusal => {
  try {
    return run();
  } catch (error) {
    if (error instanceof RemoteError) {
      return refusalOfRemote(error);
    }
    throw error;
  }
};

const isRefusal = (value: unknown): value is ApiRefusal =>
  typeof value === "object" && value !== null && "status" in value && "code" in value;

export const syncRoutes = (context: SyncContext) => {
  const { ledger, reference, config } = context;

  const rules = (): RemoteRules => ({
    schema: CURRENT_LEDGER_SCHEMA,
    now: context.now(),
    clockToleranceMs: config.clockToleranceSeconds * 1000,
  });

  /** The remote as it is: its bytes, their etag and its lines. */
  const remote = async () => {
    const body = await ledger.read();
    return { body, etag: sha256Hex(body), lines: linesOfText(decodeUtf8Strict(body, false)) };
  };

  /** `GET /api/ledger` (§5.1): the exact bytes and their SHA-256, uninterpreted; gzip from 256 KiB. */
  const readLedger = async (acceptEncoding?: string): Promise<Outcome> => {
    const body = await ledger.read();
    return {
      result: bytesCompressed(
        200,
        body,
        {
          "content-type": "application/x-ndjson; charset=utf-8",
          etag: `"${sha256Hex(body)}"`,
        },
        acceptEncoding,
      ),
      code: "ledger_read",
    };
  };

  /** `POST /api/ledger/lines` (§5.2): the valid stretch, in one conditional write. */
  const appendLines = async (ifMatch: string | undefined, body: unknown): Promise<Outcome> => {
    const asked = requestedEtag(ifMatch);
    if ("absent" in asked) {
      return fail(refusal("precondition_required"));
    }
    const entries = judged(() => parseAppendBody(body));
    if (isRefusal(entries)) {
      return fail(entries);
    }
    const current = await remote();
    if (asked.etag !== current.etag) {
      return fail(refusal("precondition_failed"));
    }
    const judgement = judged(() => acceptAppend(current.lines, entries, rules()));
    if (isRefusal(judgement)) {
      return fail(judgement);
    }
    if (utf8Of(judgement.lines) === undefined) {
      return fail(refusal("body_invalid", { reason: "not_utf8" }));
    }
    let etag = current.etag;
    if (judgement.accepted > 0) {
      try {
        etag = (await ledger.appendLines(judgement.lines, current.etag)).etag;
      } catch (error) {
        if (error instanceof ConflictError) {
          return fail(refusal("precondition_failed"));
        }
        throw error;
      }
    }
    return {
      result: json(200, {
        etag,
        lines: current.lines.length + judgement.lines.length,
        accepted: judgement.accepted,
        ...(judgement.rejected === undefined ? {} : { rejected: judgement.rejected }),
      }),
      code: judgement.rejected === undefined ? "lines_appended" : "line_rejected",
    };
  };

  /** `GET /api/reference/index` (§6): the first level of each prefix. */
  const indexReference = async (): Promise<Outcome> => {
    const [ecb, prices] = await Promise.all([
      reference.list("reference/ecb/"),
      reference.list("prices/"),
    ]);
    return { result: json(200, referenceIndex(ecb, prices)) };
  };

  /** `GET /api/reference/<kind>/<name>` (§6): the name checked **before** S3 is touched. */
  const readReference = async (
    kind: ReferenceKind,
    name: string,
    ifNoneMatch: string | undefined,
    acceptEncoding?: string,
  ): Promise<Outcome> => {
    const key = referenceKey(kind, name);
    if ("code" in key) {
      return fail(key);
    }
    const type = referenceContentType(name);
    if (type === undefined) {
      return fail(refusal("not_found", { reason: "type" }));
    }
    const stored = await reference.get(key.key);
    if (stored === undefined) {
      return fail(refusal("not_found", { reason: "missing" }));
    }
    // Never served: a key twice, or one it
    // does not have. It did not go through the difference of `push`.
    const unservable =
      kind === "prices" && name === "symbols.json"
        ? unservableSymbols(new TextDecoder().decode(stored.body))
        : undefined;
    if (unservable !== undefined) {
      return fail(refusal("not_found", { reason: unservable }));
    }
    const version = versionOf(stored.etag);
    const headers = { etag: `"${version}"` };
    if (ifNoneMatchHits(ifNoneMatch, version)) {
      return { result: notModified(headers), code: "not_modified" };
    }
    return {
      result: bytesCompressed(
        200,
        stored.body,
        { ...headers, "content-type": type },
        acceptEncoding,
      ),
    };
  };

  return {
    readLedger,
    appendLines,
    indexReference,
    readReference,
  };
};
