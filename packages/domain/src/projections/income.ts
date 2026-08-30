// Investment income (dividends, interest): capital income with withholdings.

import { yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { FxRate } from "../money/fx-rate.js";
import type { Money } from "../money/money.js";
import type { AccountId, AssetId } from "../schema/events.js";
import type { InvestmentIncome, LedgerState } from "./state.js";

export interface IncomeInput {
  event_id: Ulid;
  kind: "dividend" | "interest";
  account_id: AccountId;
  asset_id?: AssetId;
  value_date: string;
  gross: Money;
  withholding_origin: Money;
  withholding_spain: Money;
  fx: FxRate;
}

export const recordIncome = (state: LedgerState, input: IncomeInput): Money => {
  const net = input.gross.sub(input.withholding_origin).sub(input.withholding_spain);
  state.income.push({
    event_id: input.event_id,
    kind: input.kind,
    account_id: input.account_id,
    ...(input.asset_id === undefined ? {} : { asset_id: input.asset_id }),
    fiscal_date: input.value_date,
    year: yearOf(input.value_date),
    gross: input.gross,
    withholding_origin: input.withholding_origin,
    withholding_spain: input.withholding_spain,
    net,
    gross_eur: input.fx.toEur(input.gross),
    withholding_origin_eur: input.fx.toEur(input.withholding_origin),
    withholding_spain_eur: input.fx.toEur(input.withholding_spain),
    net_eur: input.fx.toEur(net),
  });
  return net;
};

export const investmentIncome = (state: LedgerState, year: number): InvestmentIncome[] =>
  state.income.filter((entry) => entry.year === year);
