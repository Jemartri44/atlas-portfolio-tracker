// Whether a share is admitted to trading on a regulated market of Directive
// 2014/65/EU, guessed from the catalogue: the `market` the user wrote (a MIC
// code or a name), its currency and its ISIN.
//
// It decides two things: whether a share is declared under "acciones
// negociadas" or under "otros elementos patrimoniales" with key 2 (help of the
// Modelo 100 of 2025: "acciones no admitidas a negociación"), and whether a
// `capital_return` may lower its cost (art. 25.1.e LIRPF: "valores admitidos a
// negociación"). The law looks at the security's admission, not at the venue
// it was bought on. It is a short table of the markets this portfolio can
// reach, not the ESMA register: what it cannot tell answers `undefined`.

import { FUND_REGULATED_MARKETS } from "../settings/defaults.js";

/**
 * The regulated markets of the EU, by MIC: the segments of category `RMKT` in
 * ISO 10383, the one list the funds use too. Then the names people write: the
 * Mercado Continuo (`XMCE`, a MIC expired in ISO 10383 that still names the
 * regulated Spanish exchanges) and «Bolsa de Madrid».
 */
const EU = [...FUND_REGULATED_MARKETS, "XMCE", "BOLSA DE MADRID"];

/**
 * Operating MICs of a whole exchange (`NSPD` in ISO 10383) and names of a
 * group, which also run a non-regulated segment (Freiverkehr in Frankfurt and
 * Xetra, Euronext Growth in Dublin and Milan, the Vienna MTF, BME Growth) where
 * foreign shares usually trade. A share written with one of them is presumed
 * to be on its regulated segment when it is quoted in euros and its ISIN is of
 * a member state, as the owner writes `XETR` for a share of the DAX; otherwise
 * the admission is checked by hand. The regulated segment, written, decides.
 */
const MIXED = ["XETR", "XFRA", "XETRA", "XDUB", "XMIL", "XWBO", "BMEX", "BME", "EURONEXT"];

/** ISO 3166-1 alpha-2 codes of the 27 member states, as an ISIN begins. */
const EU_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
];

/** Markets outside the EU: the United States, the United Kingdom, Switzerland and the large Asian ones. */
const NOT_EU = [
  "XNYS",
  "XNAS",
  "ARCX",
  "BATS",
  "XASE",
  "IEXG",
  "NYSE",
  "NASDAQ",
  "NYSE ARCA",
  "XLON",
  "LSE",
  "XSWX",
  "SIX",
  "XTSE",
  "XTKS",
  "XHKG",
  "XASX",
];

const normalise = (text: string): string => text.trim().toUpperCase();

/** What the guess reads off a catalogue asset. */
export interface ListingFacts {
  market?: string;
  currency: string;
  isin?: string;
}

/** Whether an ISO 3166-1 alpha-2 code is a member state of the EU. */
export const isEuCountry = (country: string): boolean => EU_COUNTRIES.includes(country);

/**
 * `true` when the share is taken as admitted on an EU regulated market,
 * `false` when its market is outside the EU, `undefined` when Atlas cannot
 * tell: no market, one it does not know, or a mixed venue where the currency
 * is not the euro or the ISIN is missing or not of a member state.
 */
export const euRegulatedAdmission = (asset: ListingFacts): boolean | undefined => {
  if (asset.market === undefined) {
    return undefined;
  }
  const key = normalise(asset.market);
  if (EU.includes(key)) {
    return true;
  }
  if (MIXED.includes(key)) {
    const country = asset.isin === undefined ? "" : normalise(asset.isin).slice(0, 2);
    return asset.currency === "EUR" && EU_COUNTRIES.includes(country) ? true : undefined;
  }
  // "NASDAQ GS", "NYSE American": the tiers of the two US exchanges.
  return NOT_EU.includes(key) || /^(NASDAQ|NYSE)\b/.test(key) ? false : undefined;
};

/** Whether the market is one of the mixed EU venues, where the admission must be checked by hand. */
export const mixedVenue = (market: string | undefined): boolean =>
  market !== undefined && MIXED.includes(normalise(market));
