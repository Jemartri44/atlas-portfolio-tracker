// The currency and region split of the indexes the owner's funds follow, as data in the code like
// the CPI table (`charts/spanish-cpi.ts`). They are the **defaults** of the exposure: the owner
// does not have to know these percentages (`exposure.ts` marks them «por defecto» and the owner's
// own always wins).
//
// - Where the figures come from is always stated (`via`, `as_of`):
//   · an index profile is the **portfolio of the ETF that physically replicates the index**, read in
//     the provider's holdings file (a declared proxy: the index factsheets only list the top five
//     countries). The currency is derived from the **country** of each holding (the unhedged
//     index), not from the currency it is quoted in; the region from the same country. Holdings
//     whose country is only a legal domicile (Cayman, Bermuda…) go to region `other`.
//   · a profile hedged to euros has currency EUR, by the hedge; a profile with no `as_of` is a
//     **definition** (gold and crypto are priced in dollars and held worldwide), not a datum.
// - Percentages are rounded to two decimals; the rounding residue goes to the largest entry so each
//   split adds up to exactly 100.
// - Each fund (ISIN → index) is there only if the manager's own factsheet was read and names both
//   the ISIN and the index. A fund not in the table gets no proposal: «sin propuesta», never a
//   guess, and the owner can choose the index in the selector.
// - The address of every source is a function apart (`indexSourceOf`, `fundSourceOf`), unused by
//   the web, so its bundle does not carry a foreign origin (ADR-0017, ADR-0019).
// - **Review it every January**, with the CPI (`docs/business-rules.md`): the holdings move.

import type { AssetClass } from "../schema/events.js";
import type { Split } from "./exposure.js";

export interface IndexProfile {
  readonly key: string;
  readonly name: string;
  /** Percent by ISO currency, adding up to 100. */
  readonly currency: Split;
  /** Percent by region key, adding up to 100. Absent when no source gives it: «sin propuesta». */
  readonly region?: Split;
  /** The fund whose portfolio or factsheet the figures were read in. Absent: a definition. */
  readonly via?: { readonly isin: string; readonly name: string };
  /** The date of the holdings or factsheet. Absent: a definition, not a datum. */
  readonly as_of?: string;
  /** The day it was read there. */
  readonly checked: string;
}

export interface KnownFund {
  readonly isin: string;
  readonly name: string;
  /** Key of the profile of the index the fund follows. */
  readonly index: string;
  readonly as_of: string;
  readonly checked: string;
}

export interface IndexTables {
  readonly profiles: Readonly<Record<string, IndexProfile>>;
  readonly funds: Readonly<Record<string, KnownFund>>;
  /** The profile proposed for an asset of that class when nothing else tells (gold, crypto). */
  readonly byClass: Readonly<Partial<Record<AssetClass, string>>>;
}

const CHECKED = "2026-11-03";

export const INDEX_PROFILES: Readonly<Record<string, IndexProfile>> = {
  msci_world: {
    key: "msci_world",
    name: "MSCI World",
    currency: {
      USD: "72.66",
      EUR: "8.12",
      JPY: "5.66",
      GBP: "3.57",
      CAD: "3.47",
      CHF: "2.37",
      AUD: "1.59",
      SEK: "0.85",
      HKD: "0.43",
      DKK: "0.41",
      SGD: "0.41",
      ILS: "0.26",
      NOK: "0.16",
      NZD: "0.04",
    },
    region: {
      north_america: "76.15",
      europe_developed: "15.47",
      asia_pacific_developed: "8.12",
      other: "0.26",
    },
    via: { isin: "IE00BFY0GT14", name: "SPDR MSCI World UCITS ETF (Acc)" },
    as_of: "2026-11-02",
    checked: CHECKED,
  },
  msci_acwi: {
    key: "msci_acwi",
    name: "MSCI ACWI",
    currency: {
      USD: "64.53",
      EUR: "7.27",
      JPY: "5.02",
      TWD: "3.18",
      GBP: "3.18",
      CAD: "3.09",
      CNY: "2.26",
      KRW: "2.25",
      CHF: "2.09",
      AUD: "1.42",
      INR: "1.34",
      SEK: "0.75",
      BRL: "0.43",
      HKD: "0.39",
      DKK: "0.36",
      SGD: "0.36",
      ZAR: "0.35",
      SAR: "0.27",
      ILS: "0.24",
      MXN: "0.2",
      AED: "0.14",
      NOK: "0.14",
      PLN: "0.12",
      THB: "0.12",
      MYR: "0.1",
      KWD: "0.05",
      QAR: "0.05",
      CLP: "0.05",
      HUF: "0.04",
      PEN: "0.04",
      NZD: "0.04",
      IDR: "0.04",
      TRY: "0.04",
      PHP: "0.02",
      CZK: "0.02",
      COP: "0.01",
    },
    region: {
      north_america: "67.62",
      europe_developed: "13.73",
      emerging: "11.19",
      asia_pacific_developed: "7.22",
      other: "0.24",
    },
    via: { isin: "IE00B44Z5B48", name: "SPDR MSCI ACWI UCITS ETF (Acc)" },
    as_of: "2026-11-02",
    checked: CHECKED,
  },
  sp500: {
    key: "sp500",
    name: "S&P 500",
    currency: {
      USD: "100.0",
    },
    region: {
      north_america: "100.0",
    },
    via: { isin: "IE00B6YX5C33", name: "SPDR S&P 500 UCITS ETF (Dist)" },
    as_of: "2026-11-02",
    checked: CHECKED,
  },
  msci_em: {
    key: "msci_em",
    name: "MSCI Emerging Markets",
    currency: {
      TWD: "28.4",
      CNY: "20.08",
      KRW: "19.9",
      INR: "11.89",
      BRL: "3.88",
      ZAR: "3.11",
      SAR: "2.43",
      MXN: "1.79",
      AED: "1.28",
      PLN: "1.21",
      MYR: "0.95",
      THB: "0.92",
      EUR: "0.59",
      QAR: "0.56",
      KWD: "0.5",
      PEN: "0.41",
      IDR: "0.4",
      CLP: "0.36",
      TRY: "0.34",
      HUF: "0.31",
      PHP: "0.25",
      COP: "0.17",
      CZK: "0.14",
      USD: "0.08",
      EGP: "0.05",
    },
    region: {
      emerging: "99.9",
      other: "0.08",
      europe_developed: "0.02",
    },
    via: { isin: "IE00B469F816", name: "SPDR MSCI Emerging Markets UCITS ETF" },
    as_of: "2026-11-02",
    checked: CHECKED,
  },
  msci_europe: {
    key: "msci_europe",
    name: "MSCI Europe",
    currency: {
      EUR: "52.61",
      GBP: "22.92",
      CHF: "15.29",
      SEK: "5.5",
      DKK: "2.64",
      NOK: "1.04",
    },
    region: {
      europe_developed: "100.0",
    },
    via: { isin: "IE00BKWQ0Q14", name: "SPDR MSCI Europe UCITS ETF" },
    as_of: "2026-11-02",
    checked: CHECKED,
  },
  global_agg_eur_hedged: {
    key: "global_agg_eur_hedged",
    name: "Bloomberg Global Aggregate (EUR hedged)",
    currency: {
      EUR: "100",
    },
    region: {
      north_america: "44.13",
      europe_developed: "25.56",
      emerging: "16.7",
      asia_pacific_developed: "10.48",
      global: "2.23",
      other: "0.9",
    },
    via: {
      isin: "IE00BF1QPL78",
      name: "SPDR Bloomberg Global Aggregate Bond EUR Hdg UCITS ETF (Dist)",
    },
    as_of: "2026-11-02",
    checked: CHECKED,
  },
  euro_government: {
    key: "euro_government",
    name: "Bloomberg Euro Government",
    currency: {
      EUR: "100",
    },
    region: {
      europe_developed: "100",
    },
    via: {
      isin: "IE00BFPM9W02",
      name: "Vanguard Euro Government Bond Index Fund (Inst. Plus EUR Acc)",
    },
    as_of: "2026-09-30",
    checked: CHECKED,
  },
  money_market_eur: {
    key: "money_market_eur",
    name: "Euro money market",
    currency: {
      EUR: "100",
    },
    checked: CHECKED,
  },
  physical_gold: {
    key: "physical_gold",
    name: "Physical gold",
    currency: {
      USD: "100",
    },
    region: {
      global: "100",
    },
    checked: CHECKED,
  },
  crypto_etp: {
    key: "crypto_etp",
    name: "Crypto",
    currency: {
      USD: "100",
    },
    region: {
      global: "100",
    },
    checked: CHECKED,
  },
};
export const KNOWN_FUNDS: Readonly<Record<string, KnownFund>> = {
  IE00B03HD191: {
    isin: "IE00B03HD191",
    name: "Vanguard Global Stock Index Fund EUR Acc",
    index: "msci_world",
    as_of: "2026-09-30",
    checked: CHECKED,
  },
  IE0032620787: {
    isin: "IE0032620787",
    name: "Vanguard U.S. 500 Stock Index Fund Investor EUR Acc",
    index: "sp500",
    as_of: "2026-09-30",
    checked: CHECKED,
  },
  IE0031786696: {
    isin: "IE0031786696",
    name: "Vanguard Emerging Markets Stock Index Fund EUR Acc",
    index: "msci_em",
    as_of: "2026-09-30",
    checked: CHECKED,
  },
  IE0007987690: {
    isin: "IE0007987690",
    name: "Vanguard European Stock Index Fund Investor EUR Acc",
    index: "msci_europe",
    as_of: "2026-09-30",
    checked: CHECKED,
  },
  IE00B18GC888: {
    isin: "IE00B18GC888",
    name: "Vanguard Global Bond Index Fund EUR Hedged Acc",
    index: "global_agg_eur_hedged",
    as_of: "2026-09-30",
    checked: CHECKED,
  },
  IE0007472990: {
    isin: "IE0007472990",
    name: "Vanguard Euro Government Bond Index Fund EUR Acc",
    index: "euro_government",
    as_of: "2026-09-30",
    checked: CHECKED,
  },
};
export const INDEX_BY_CLASS: Readonly<Partial<Record<AssetClass, string>>> = {
  gold: "physical_gold",
  crypto: "crypto_etp",
};

export const DEFAULT_INDEX_TABLES: IndexTables = {
  profiles: INDEX_PROFILES,
  funds: KNOWN_FUNDS,
  byClass: INDEX_BY_CLASS,
};

const SSGA =
  "https://www.ssga.com/library-content/products/fund-data/etfs/emea/holdings-daily-emea-en-";

const SOURCE_BY_FUND: Readonly<Record<string, string>> = {
  IE00BFY0GT14: `${SSGA}sppw-gy.xlsx`,
  IE00B44Z5B48: `${SSGA}spyy-gy.xlsx`,
  IE00B6YX5C33: `${SSGA}spy5-gy.xlsx`,
  IE00B469F816: `${SSGA}spym-gy.xlsx`,
  IE00BKWQ0Q14: `${SSGA}ero-fp.xlsx`,
  IE00BF1QPL78: `${SSGA}spfe-gy.xlsx`,
  IE00BFPM9W02:
    "https://fund-docs.vanguard.com/Euro_Government_Bond_Index_Fund_9187_EUR_EN_INT_IRISH.pdf",
};

/**
 * Where the figures of a profile were read: the holdings file of its ETF, or the factsheet of the
 * Vanguard fund (the euro government profile, whose region is the euro zone by definition of the
 * index). Not used by the web, so its bundle does not carry the address. A definition has none.
 */
export const indexSourceOf = (key: string): string | undefined => {
  const isin = INDEX_PROFILES[key]?.via?.isin;
  return isin === undefined ? undefined : SOURCE_BY_FUND[isin];
};

const FUND_PAGES: Readonly<Record<string, string>> = {
  IE00B03HD191: "equity/9837/global-stock-index-fund-eur-acc",
  IE0032620787: "equity/9842/IE0032620787",
  IE0031786696: "equity/9229/emerging-markets-stock-index-fund-eur-acc",
  IE0007987690: "equity/9923/european-stock-index-fund-eur-investor-shares",
  IE00B18GC888: "bond/9197/global-bond-index-fund-eur-hedged-acc",
  IE0007472990: "bond/9971/euro-government-bond-index-fund-eur-acc",
};

/**
 * The page of the manager (Vanguard) whose factsheet names the ISIN and the index of a known fund.
 * Not used by the web, so its bundle does not carry the address.
 */
export const fundSourceOf = (isin: string): string | undefined => {
  const page = FUND_PAGES[isin];
  return page === undefined
    ? undefined
    : `https://www.vanguard.co.uk/professional/product/fund/${page}`;
};
