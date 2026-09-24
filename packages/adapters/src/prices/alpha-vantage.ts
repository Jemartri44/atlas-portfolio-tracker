// Alpha Vantage as a `PriceSource` (ADR-0031: the fallback), verified on
// 2026-09-24 (`specs/013-daily-close-prices/questions.md` §1.4):
//
// - `TIME_SERIES_DAILY`, `outputsize=compact` (the free plan sees the last
//   100 market days), closes **as traded** and **as strings** (`"4. close"`),
//   no currency in the answer;
// - the currency, from `SYMBOL_SEARCH` (`"8. currency"`);
// - the key travels **in the URL** (`apikey`), so no address is kept;
// - **every answer comes with HTTP 200**: success and failure are told apart
//   by the key of the body (decision D-Q4). A made-up key is not rejected: it
//   gets data, an `Error Message` or the `Information` of the limit, so this
//   source **cannot say `blocked` reliably**; only a message that names the
//   key says it.

import type { CivilDate } from "@atlas/domain";
import type { DailyClose, PriceSource, SourceResult } from "@atlas/domain/quotes";
import { ask, type Fetch, failure } from "./fetch.js";
import { closeOf } from "./shape.js";

export const ALPHA_VANTAGE_API = "https://www.alphavantage.co/query";

type Body = Record<string, unknown>;

const isObject = (value: unknown): value is Body =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class AlphaVantagePriceSource implements PriceSource {
  readonly name = "alpha_vantage";

  constructor(
    private readonly key: string,
    private readonly fetchUrl: Fetch = (url) => fetch(url),
  ) {}

  /** The body of an answer, or the failure it means. */
  private async get(query: string, expected: string): Promise<SourceResult<Body>> {
    const answer = await ask(
      this.fetchUrl,
      `${ALPHA_VANTAGE_API}?${query}&apikey=${encodeURIComponent(this.key)}`,
    );
    if (answer === undefined) {
      return failure("unavailable");
    }
    if (answer.status !== 200) {
      return failure(
        answer.status === 429
          ? "rate_limited"
          : answer.status >= 500
            ? "unavailable"
            : "invalid_response",
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(answer.text);
    } catch {
      return failure("invalid_response");
    }
    if (!isObject(body)) {
      return failure("invalid_response");
    }
    if (typeof body[expected] === "object" && body[expected] !== null) {
      return { ok: true, value: body };
    }
    const error = body["Error Message"];
    if (typeof error === "string") {
      return failure(/apikey/i.test(error) ? "blocked" : "not_found");
    }
    if (typeof body.Information === "string" || typeof body.Note === "string") {
      return failure("rate_limited");
    }
    return failure("invalid_response");
  }

  async dailyCloses(
    symbol: string,
    from: CivilDate,
    to: CivilDate,
  ): Promise<SourceResult<DailyClose[]>> {
    const result = await this.get(
      `function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact`,
      "Time Series (Daily)",
    );
    if (!result.ok) {
      return result;
    }
    const closes: DailyClose[] = [];
    for (const [date, day] of Object.entries(result.value["Time Series (Daily)"] as Body)) {
      const close = closeOf(date, isObject(day) ? day["4. close"] : undefined);
      if (close === undefined) {
        return failure("invalid_response");
      }
      if (close.date >= from && close.date <= to) {
        closes.push(close);
      }
    }
    return { ok: true, value: closes.sort((a, b) => (a.date < b.date ? -1 : 1)) };
  }

  async currencyOf(symbol: string): Promise<SourceResult<string | undefined>> {
    const result = await this.get(
      `function=SYMBOL_SEARCH&keywords=${encodeURIComponent(symbol)}`,
      "bestMatches",
    );
    if (!result.ok) {
      return result;
    }
    const matches = result.value.bestMatches;
    const match = (Array.isArray(matches) ? matches : []).find(
      (item) => isObject(item) && item["1. symbol"] === symbol,
    ) as Body | undefined;
    const currency = match?.["8. currency"];
    return {
      ok: true,
      value: typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
    };
  }
}
