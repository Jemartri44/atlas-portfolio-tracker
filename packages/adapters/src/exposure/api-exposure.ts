// The exposure of the owner, from a client (`docs/api.md` §6.2): `GET` and `PUT /api/exposure`
// with the cookie of the web. No rule lives here: what is valid is `validateExposure`'s, and what a
// refusal may be is the domain's (`@atlas/domain/sync`). Nothing is kept on the device.
//
// - `read` gives the bytes as stored with their etag, **without judging them**: whoever uses them
//   decides (`exposureOrNone`). An object that does not exist is `missing`, not an error.
// - `write` validates first (`exposureText`), so nothing invalid leaves the client, and sends the
//   object whole with `If-Match` (or `If-None-Match: *` the first time). A `412` or a `428` is a
//   `RemoteError` with its code: the owner reads again before writing again.

import { type Exposures, exposureText } from "@atlas/domain/portfolio";
import { etagOfHeader, parseErrorAnswer, RemoteError } from "@atlas/domain/sync";
import { apiFetch } from "../sync/api-fetch.js";

export interface ApiExposureStoreOptions {
  /** The web's own origin. */
  readonly origin: string;
  readonly fetch: typeof fetch;
}

export type ExposureRead =
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

export class ApiExposureStore {
  constructor(private readonly options: ApiExposureStoreOptions) {}

  async read(): Promise<ExposureRead> {
    const response = await apiFetch(this.options, "GET", "/api/exposure");
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
  async write(exposures: Exposures, etag: string | undefined): Promise<{ etag: string }> {
    // Validated and put in its canonical form before anything is sent.
    const body: unknown = JSON.parse(exposureText(exposures));
    const response = await apiFetch(
      this.options,
      "PUT",
      "/api/exposure",
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
