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

/** Regulated markets of the EU, by MIC and by the names people write. */
const EU = [
  "XMAD",
  "XMCE",
  "XBAR",
  "XBIL",
  "XVAL",
  "BMEX",
  "BME",
  "XPAR",
  "XAMS",
  "XBRU",
  "XLIS",
  "XMIL",
  "XDUB",
  "XETR",
  "XFRA",
  "XETRA",
  "XWBO",
  "XHEL",
  "XSTO",
  "XCSE",
  "XWAR",
  "XATH",
  "XPRA",
  "XBUD",
  "XLUX",
  "EURONEXT",
  "BOLSA DE MADRID",
];

/**
 * EU venues that also run a non-regulated segment (Freiverkehr in Frankfurt
 * and Xetra, Euronext Growth, BME Growth) where foreign shares usually trade:
 * there the venue alone does not prove the admission.
 */
const MIXED = ["XETR", "XFRA", "XETRA", "BMEX", "BME", "EURONEXT"];

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
  market?: string | undefined;
  currency: string;
  isin?: string;
}

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
    if (!MIXED.includes(key)) {
      return true;
    }
    const country = asset.isin === undefined ? "" : normalise(asset.isin).slice(0, 2);
    return asset.currency === "EUR" && EU_COUNTRIES.includes(country) ? true : undefined;
  }
  // "NASDAQ GS", "NYSE American": the tiers of the two US exchanges.
  return NOT_EU.includes(key) || /^(NASDAQ|NYSE)\b/.test(key) ? false : undefined;
};

/** Whether the market is one of the mixed EU venues, where the admission must be checked by hand. */
export const mixedVenue = (market: string | undefined): boolean =>
  market !== undefined && MIXED.includes(normalise(market));
