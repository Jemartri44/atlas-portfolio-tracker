// The objects of `settings/` from a client (`docs/api.md` §6.2): `GET` and `PUT` with the cookie of
// the web. No rule lives here: what is valid is the domain's validator, and what a refusal may be is
// the domain's (`@atlas/domain/sync`). Nothing is kept on the device.
//
// - `read` gives the bytes as stored with their etag, **without judging them**: whoever uses them
//   decides (`exposureOrNone`, `projectionOrNone`). An object that does not exist is `missing`.
// - `write` validates first, so nothing invalid leaves the client, and sends the object whole with
//   `If-Match` (or `If-None-Match: *` the first time). A `412` or a `428` is a `RemoteError` with
//   its code: the owner reads again before writing again.

import {
  type Exposures,
  exposureText,
  type ProjectionEdits,
  projectionText,
} from "@atlas/domain/portfolio";
import { etagOfHeader, parseErrorAnswer, RemoteError } from "@atlas/domain/sync";
import { apiFetch } from "../sync/api-fetch.js";

export interface ApiSettingsOptions {
  /** The web's own origin. */
  readonly origin: string;
  readonly fetch: typeof fetch;
}

export type SettingsRead =
  | { readonly kind: "missing" }
  | { readonly kind: "found"; readonly etag: string; readonly text: string };

const shapeless = (status: number): RemoteError =>
  new RemoteError("transport_rejected", status, { reason: "shape" });

const failed = async (response: Response): Promise<RemoteError> => {
  let json: unknown;
  try {
    json = JSON.parse(await response.text());
  } catch {
    json = undefined;
  }
  const error = parseErrorAnswer(json);
  return error === undefined
    ? shapeless(response.status)
    : new RemoteError(error.code, response.status, error.details);
};

class ApiSettingsObject<T> {
  constructor(
    private readonly options: ApiSettingsOptions,
    private readonly path: string,
    private readonly textOf: (value: T) => string,
  ) {}

  async read(): Promise<SettingsRead> {
    const response = await apiFetch(this.options, "GET", this.path);
    if (response.status === 404) {
      return { kind: "missing" };
    }
    if (response.status !== 200) {
      throw await failed(response);
    }
    const etag = etagOfHeader(response.headers.get("etag"));
    if (etag === undefined) {
      throw shapeless(response.status);
    }
    return { kind: "found", etag, text: await response.text() };
  }

  /** The etag of what is stored now. `etag` is what was read; absent when nothing existed. */
  async write(value: T, etag: string | undefined): Promise<{ etag: string }> {
    // Validated and put in its canonical form before anything is sent.
    const body: unknown = JSON.parse(this.textOf(value));
    const response = await apiFetch(
      this.options,
      "PUT",
      this.path,
      body,
      etag === undefined ? { "if-none-match": "*" } : { "if-match": `"${etag}"` },
    );
    if (response.status !== 200) {
      throw await failed(response);
    }
    let json: unknown;
    try {
      json = JSON.parse(await response.text());
    } catch {
      json = undefined;
    }
    const written = (json as { etag?: unknown } | null)?.etag;
    if (typeof written !== "string") {
      throw shapeless(response.status);
    }
    return { etag: written };
  }
}

export class ApiExposureStore extends ApiSettingsObject<Exposures> {
  constructor(options: ApiSettingsOptions) {
    super(options, "/api/exposure", exposureText);
  }
}

export class ApiProjectionStore extends ApiSettingsObject<ProjectionEdits> {
  constructor(options: ApiSettingsOptions) {
    super(options, "/api/projection", projectionText);
  }
}
