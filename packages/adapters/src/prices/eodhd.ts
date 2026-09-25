// EODHD as a `PriceSource` (ADR-0031: the primary source), verified on
// 2026-09-24 (`specs/013-daily-close-prices/questions.md` §1.1):
//
// - end of day: `GET /api/eod/{SYMBOL}?api_token=…&fmt=json&from=&to=`, one
//   call whatever the range; `close` is the close **as traded**, never
//   `adjusted_close`; no currency in the answer;
// - the currency, from the list of symbols of the exchange filtered by code:
//   `GET /api/exchange-symbol-list/{EXCHANGE}?…&symbols={CODE}` (`Currency`);
// - the key travels **in the URL** (`api_token`), so no address is kept;
// - errors by status: 401 bad key, 402 its daily limit, 403 a valid key
//   without right to that symbol, 404 unknown symbol, 429 per minute.
//
// **The addresses of EODHD live here and nowhere else**: in the Node barrel of
// `@atlas/adapters`, outside every subpath the web imports, and never in the
// domain. The architecture test holds it.

import type { CivilDate } from "@atlas/domain";
import type { DailyClose, PriceSource, SourceResult } from "@atlas/domain/quotes";
import { JsonNumber, parseExactJson } from "./exact-json.js";
import { type Answer, ask, type Fetch, failure } from "./fetch.js";
import { closeOf } from "./shape.js";

export const EODHD_API = "https://eodhd.com/api";

/**
 * Each status to its kind, one to one (decision D-Q4): a 403 is `not_found`
 * **of that symbol** — an index outside the free plan must not stop the source
 * for every other symbol, which `blocked` would.
 */
const kindOfStatus = (status: number) => {
  switch (status) {
    case 401:
      return "blocked";
    case 402:
    case 429:
      return "rate_limited";
    case 403:
    case 404:
      return "not_found";
    default:
      return status >= 500 ? "unavailable" : "invalid_response";
  }
};

/** The body of a 200 as JSON with exact numbers, or `undefined` when it is not JSON. */
const jsonOf = (answer: Answer, parse?: Parameters<typeof parseExactJson>[1]): unknown => {
  try {
    return parseExactJson(answer.text, parse);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
};

export class EodhdPriceSource implements PriceSource {
  readonly name = "eodhd";

  constructor(
    private readonly key: string,
    private readonly fetchUrl: Fetch = (url) => fetch(url),
    /** The `JSON.parse` of the runtime; replaced in tests by one without `context`. */
    private readonly parse?: Parameters<typeof parseExactJson>[1],
  ) {}

  /** Stops, with `ExactJsonUnsupported`, where a number could only be read as a float (D-Q1). */
  ready(): void {
    parseExactJson("[1]", this.parse);
  }

  private async get(path: string, query: string): Promise<SourceResult<unknown>> {
    const answer = await ask(
      this.fetchUrl,
      `${EODHD_API}/${path}?api_token=${encodeURIComponent(this.key)}&fmt=json${query}`,
    );
    if (answer === undefined) {
      return failure("unavailable");
    }
    if (answer.status !== 200) {
      return failure(kindOfStatus(answer.status));
    }
    const body = jsonOf(answer, this.parse);
    return body === undefined ? failure("invalid_response") : { ok: true, value: body };
  }

  async dailyCloses(
    symbol: string,
    from: CivilDate,
    to: CivilDate,
  ): Promise<SourceResult<DailyClose[]>> {
    const result = await this.get(`eod/${encodeURIComponent(symbol)}`, `&from=${from}&to=${to}`);
    if (!result.ok) {
      return result;
    }
    if (!Array.isArray(result.value)) {
      return failure("invalid_response");
    }
    const closes: DailyClose[] = [];
    for (const item of result.value) {
      // The close arrives as a JSON number: only its exact text is accepted.
      const { date, close: number } = (item ?? {}) as { date?: unknown; close?: unknown };
      const close = closeOf(date, number instanceof JsonNumber ? number.text : undefined);
      if (close === undefined) {
        return failure("invalid_response");
      }
      closes.push(close);
    }
    return { ok: true, value: closes };
  }

  async currencyOf(symbol: string): Promise<SourceResult<string | undefined>> {
    const dot = symbol.lastIndexOf(".");
    const code = dot < 0 ? symbol : symbol.slice(0, dot);
    const exchange = dot < 0 ? "US" : symbol.slice(dot + 1);
    const result = await this.get(
      `exchange-symbol-list/${encodeURIComponent(exchange)}`,
      `&symbols=${encodeURIComponent(code)}`,
    );
    if (!result.ok) {
      return result;
    }
    if (!Array.isArray(result.value)) {
      return failure("invalid_response");
    }
    const row = result.value.find((item) => (item as { Code?: unknown })?.Code === code) as
      | { Currency?: unknown }
      | undefined;
    const currency = row?.Currency;
    return {
      ok: true,
      value: typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
    };
  }
}
