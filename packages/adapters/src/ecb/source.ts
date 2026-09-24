// The ECB as an `FxRateSource` (ADR-0029, points 1 and 3; decision (l) of
// prompt 012). **The ZIP is the preferred source and the API only the
// fallback**; what comes from the API is stored as it came and named as the
// API, never rebuilt in the shape of the ZIP.
//
// **The addresses of the ECB live here and nowhere else**: in
// `@atlas/adapters`, outside the subpaths the web imports (`./blob`,
// `./browser`, `./clock`, `./random`) and never in `@atlas/domain`, which the
// web bundles whole. The web does not download anything from a third party
// (ADR-0028, ADR-0029): the architecture test and the check of the bundle's
// origins hold it.

import type { DownloadedHistory, FxRateSource } from "@atlas/domain/ecb";
import { entryOfZip } from "./zip.js";

export const ECB_ZIP_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip";
/** Every daily series against the euro, values only, oldest first. */
export const ECB_API_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?format=csvdata&detail=dataonly";

/** Neither the ZIP nor the API could be used; nothing was written. */
export class EcbDownloadFailed extends Error {
  constructor(
    readonly zip: string,
    readonly api: string,
  ) {
    super(`the ECB history could not be downloaded (ZIP: ${zip}; API: ${api})`);
    this.name = "EcbDownloadFailed";
  }
}

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type Fetch = (url: string) => Promise<Response>;

export class EcbFxRateSource implements FxRateSource {
  constructor(
    private readonly fetchUrl: Fetch = (url) => fetch(url),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async bytesOf(url: string): Promise<Uint8Array> {
    const response = await this.fetchUrl(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async download(): Promise<DownloadedHistory> {
    const fetched_at = this.now().toISOString();
    let zipFailure: string;
    try {
      const { bytes } = entryOfZip(await this.bytesOf(ECB_ZIP_URL), ".csv");
      return { source: "zip", bytes, url: ECB_ZIP_URL, fetched_at };
    } catch (error) {
      zipFailure = reasonOf(error);
    }
    try {
      const bytes = await this.bytesOf(ECB_API_URL);
      return { source: "api", bytes, url: ECB_API_URL, fetched_at, zip_failure: zipFailure };
    } catch (error) {
      throw new EcbDownloadFailed(zipFailure, reasonOf(error));
    }
  }
}
