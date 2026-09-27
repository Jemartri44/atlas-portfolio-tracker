// The simulated price source of `dev` (feature 016, E2; §8.1 P14, §8.2 m3):
// fixed answers, so that the 018 can wake a schedule of `dev` once and see the
// chain Scheduler → role → Lambda work without the keys of the user, which
// `dev` never has (ADR-0034, row 2). **The one declared exception to the
// guardian of the doubles**: it travels in `jobs.zip`, built once and
// promoted, and the configuration of the function **refuses it in `prod`**
// (`parseJobsConfig`, `simulated_in_prod`). It answers as `eodhd`, the name
// the store knows, a close of `100` for every weekday asked, in the currency
// of the symbol's declaration, and never calls anything.

import type { CivilDate } from "@atlas/domain";
import type { DailyClose, PriceSource, SourceResult } from "@atlas/domain/quotes";

const weekday = (date: CivilDate): boolean => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
};

const nextDay = (date: CivilDate): CivilDate =>
  new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export class SimulatedPriceSource implements PriceSource {
  readonly name = "eodhd";

  async dailyCloses(
    _symbol: string,
    from: CivilDate,
    to: CivilDate,
  ): Promise<SourceResult<DailyClose[]>> {
    const closes: DailyClose[] = [];
    for (let date = from; date <= to && closes.length < 400; date = nextDay(date)) {
      if (weekday(date)) {
        closes.push({ date, close: "100" });
      }
    }
    return { ok: true, value: closes };
  }

  async currencyOf(): Promise<SourceResult<string | undefined>> {
    return { ok: true, value: undefined };
  }
}
