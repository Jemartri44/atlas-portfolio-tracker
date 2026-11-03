import type { AssetFields, AssetId, CorporateActionEvent } from "../schema/events.js";
import { isEuCountry } from "./markets.js";

/**
 * Fixed fine per operation for not filing the communication (art. 89.1 LIS).
 * Already written out: it is the law's figure, not the user's, so neither the
 * privacy mask nor the raw figures of the console apply to it.
 */
export const PARTNER_FINE = "10.000 €";

/** The operations the neutrality regime of the LIS speaks about, when they hand over other securities. */
export const isCompanyExchange = (event: CorporateActionEvent): boolean =>
  ["merger", "spin_off", "issuer_restructuring"].includes(event.kind) &&
  event.effects.some((effect) => effect.op === "convert" || effect.op === "carve_out");

/** Says the regime does not apply and still keeps date and cost: the gain of the exchange is missing. */
export const deniesRegimeKeepingCost = (event: CorporateActionEvent): boolean =>
  event.neutrality_regime === false &&
  event.effects.some((effect) => effect.op === "convert" || effect.op === "carve_out");

export interface ExchangeNotice {
  code:
    | "exchange_acquirer_outside_eu"
    | "exchange_partner_communication"
    | "exchange_cash_cap"
    | "exchange_domicile_unknown"
    | "convert_fund_to_listed_fund";
  details: Record<string, unknown>;
}

type Catalogue = ReadonlyMap<AssetId, Pick<AssetFields, "asset_type" | "isin" | "issuer_country">>;

/**
 * The ISIN decides the domicile, as in the wash-sale rule, unless its prefix is
 * no country (`XS`, international securities); `undefined` when Atlas cannot tell.
 */
const domicileOf = (asset: { isin?: string; issuer_country?: string } | undefined) => {
  const prefix = asset?.isin?.slice(0, 2).toUpperCase();
  return prefix === undefined || prefix.startsWith("X")
    ? asset?.issuer_country?.toUpperCase()
    : prefix;
};

const received = (event: CorporateActionEvent): AssetId[] =>
  event.effects.flatMap((effect) =>
    effect.op === "convert" || effect.op === "carve_out" ? [effect.to_asset_id] : [],
  );

/**
 * What an operation that keeps date and cost has to be told about requisites
 * Atlas cannot decide on its own. Only ever notices: the regime is the user's
 * reading (`neutrality_regime`). When the user applies the regime and Atlas
 * does not know where an issuer sits, it says so instead of keeping quiet: that
 * is where the communication may be owed. With nothing stated, the exchange is
 * already among the doubtful criteria.
 *
 * - Art. 80.1.b LIS: in an exchange of securities the acquirer has to be
 *   Spanish or within Directive 2009/133/EC. A merger looks at the shareholder
 *   instead (art. 81.1), and the ledger has no kind that tells them apart, so a
 *   spin-off is the only one left out.
 * - Art. 89.1 LIS and art. 48 RIS: when neither entity is Spanish, the
 *   shareholder has to file the communication; missing it costs a fixed fine.
 * - Arts. 76.1 and 76.5 LIS: the cash may not exceed 10% of the nominal value,
 *   which the ledger does not hold.
 * - Art. 94.1.a LIRPF: the deferral between funds excludes listed funds.
 */
export const exchangeNotices = (
  assets: Catalogue,
  event: CorporateActionEvent,
): ExchangeNotice[] => {
  const notices: ExchangeNotice[] = [];
  const origin = assets.get(event.asset_id);
  for (const assetId of received(event)) {
    const target = assets.get(assetId);
    if (origin?.asset_type === "fund" && target?.asset_type === "etf") {
      notices.push({
        code: "convert_fund_to_listed_fund",
        details: { from_asset_id: event.asset_id, to_asset_id: assetId },
      });
    }
  }
  if (!isCompanyExchange(event) || event.neutrality_regime === false) {
    return notices;
  }
  const from = domicileOf(origin);
  const targets = [...new Set(received(event))].flatMap((assetId) => {
    const to = domicileOf(assets.get(assetId));
    return to === undefined ? [] : [{ assetId, to }];
  });
  if (event.kind !== "spin_off") {
    for (const { assetId, to } of targets.filter(({ to }) => !isEuCountry(to))) {
      notices.push({
        code: "exchange_acquirer_outside_eu",
        details: { asset_id: assetId, country: to },
      });
    }
  }
  const unknown = [event.asset_id, ...new Set(received(event))].filter(
    (assetId) => domicileOf(assets.get(assetId)) === undefined,
  );
  if (event.neutrality_regime === true && unknown.length > 0) {
    notices.push({ code: "exchange_domicile_unknown", details: { assets: unknown } });
  }
  // One communication per operation, however many securities it hands over.
  const foreign = targets.find(({ to }) => to !== "ES");
  if (from !== undefined && from !== "ES" && foreign !== undefined) {
    notices.push({
      code: "exchange_partner_communication",
      details: {
        from_asset_id: event.asset_id,
        to_asset_id: foreign.assetId,
      },
    });
  }
  if (event.effects.some((effect) => effect.op === "cost_adjustment")) {
    notices.push({ code: "exchange_cash_cap", details: { kind: event.kind } });
  }
  return notices;
};
