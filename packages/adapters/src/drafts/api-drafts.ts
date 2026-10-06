// The drafts of the cloud, from a client (ADR-0035, E6; `docs/api.md` §6.1):
// `PendingDraftStore` over the four routes of the API, the credential injected
// like `httpRemote` (the token of the console, or the cookie of the web). No
// rule lives here; no copy is kept anywhere: **nothing of a draft stays on the
// device**. Every request goes with `redirect: "error"` and `no-store`, and
// every POST with the SHA-256 of its exact body (ADR-0027, fact 2).
//
// A draft is never deleted in the cloud: `remove` closes it as confirmed or
// discarded. A draft already gone is not an error there, as on the disk.

import {
  DraftChangedError,
  type DraftEnd,
  type PendingDraft,
  type PendingDraftStore,
  parsePendingDraft,
} from "@atlas/domain/ecb";
import { parseErrorAnswer, RemoteError } from "@atlas/domain/sync";

export interface ApiDraftStoreOptions {
  /** `https://…` of the console's entry, or the web's own origin. */
  readonly origin: string;
  readonly fetch: typeof fetch;
  /** The device token of the console; without it, the cookie of the web travels. */
  readonly token?: string;
}

/** `cache` is a DOM-only member of `RequestInit`. */
const NO_STORE = { cache: "no-store" } as const;

const hex = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class ApiDraftStore implements PendingDraftStore {
  constructor(private readonly options: ApiDraftStoreOptions) {}

  private async call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = {};
    if (this.options.token !== undefined) {
      headers["x-atlas-device-token"] = this.options.token;
    }
    let payload: Uint8Array | undefined;
    if (body !== undefined) {
      payload = new TextEncoder().encode(JSON.stringify(body));
      headers["content-type"] = "application/json";
      headers["x-amz-content-sha256"] = await hex(payload);
    }
    let response: Response;
    try {
      response = await this.options.fetch(`${this.options.origin}${path}`, {
        method,
        headers,
        redirect: "error",
        ...NO_STORE,
        credentials: this.options.token === undefined ? "same-origin" : "omit",
        ...(payload === undefined ? {} : { body: payload as Uint8Array<ArrayBuffer> }),
      });
    } catch {
      throw new RemoteError("network_failed", undefined);
    }
    let json: unknown;
    try {
      json = JSON.parse(await response.text());
    } catch {
      json = undefined;
    }
    return { status: response.status, json };
  }

  /** `200`/`201` with a JSON body, or the error of §7 as a `RemoteError` (`transport_rejected` if it has no shape). */
  private async ok(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const { status, json } = await this.call(method, path, body);
    if (status !== 200 && status !== 201) {
      const error = parseErrorAnswer(json);
      throw error === undefined
        ? new RemoteError("transport_rejected", status, { reason: "shape" })
        : new RemoteError(error.code, status, error.details);
    }
    if (!isRecord(json)) {
      throw new RemoteError("transport_rejected", status, { reason: "shape" });
    }
    return json;
  }

  async list(): Promise<{ drafts: PendingDraft[]; unreadable: string[] }> {
    const answer = await this.ok("GET", "/api/drafts");
    const unreadable = Array.isArray(answer.unreadable) ? answer.unreadable.map(String) : [];
    const drafts: PendingDraft[] = [];
    for (const entry of Array.isArray(answer.drafts) ? answer.drafts : []) {
      try {
        drafts.push(parsePendingDraft(JSON.stringify(entry)));
      } catch {
        unreadable.push(String((entry as { id?: unknown })?.id ?? "unknown"));
      }
    }
    return { drafts, unreadable };
  }

  async save(draft: PendingDraft): Promise<void> {
    const { pending_event_id: _stamp, ...saved } = draft;
    await this.ok("POST", "/api/drafts", { draft: saved });
  }

  /** The stamp: created once in the cloud, so "only if as it was read" is the API's own 409. */
  async update(draft: PendingDraft, _readStamp: string | undefined): Promise<void> {
    if (draft.pending_event_id === undefined) {
      return;
    }
    try {
      await this.ok("POST", `/api/drafts/${draft.id}/stamp`, {
        pending_event_id: draft.pending_event_id,
      });
    } catch (error) {
      throw this.changed(error, draft.id);
    }
  }

  async remove(id: string, end: DraftEnd = { outcome: "discarded" }): Promise<void> {
    try {
      await this.ok(
        "POST",
        `/api/drafts/${id}/end`,
        end.outcome === "confirmed"
          ? { outcome: "confirmed", event_id: end.eventId }
          : { outcome: "discarded" },
      );
    } catch (error) {
      // Already gone (or never there): removing it is done, as on the disk.
      if (
        error instanceof RemoteError &&
        (error.status === 404 || (error.code === "draft_changed" && error.details.now === "gone"))
      ) {
        return;
      }
      throw this.changed(error, id);
    }
  }

  /** A 409 or a 404 of the API is the draft no longer being as it was read. */
  private changed(error: unknown, id: string): unknown {
    if (error instanceof RemoteError && error.code === "draft_changed") {
      return new DraftChangedError(id, error.details.now === "gone" ? "gone" : "stamped");
    }
    if (error instanceof RemoteError && error.status === 404) {
      return new DraftChangedError(id, "gone");
    }
    return error;
  }
}
