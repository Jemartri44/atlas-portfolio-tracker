// Whether a market is a regulated market of Directive 2014/65/EU, read off the
// `market` the user wrote in the catalogue (a MIC code or a name).
//
// It decides two things: whether a share is declared under "acciones
// negociadas" or under "otros elementos patrimoniales" (help of the Modelo 100
// of 2025), and whether a `capital_return` may lower its cost (art. 25.1.e
// LIRPF). It is a short table of the markets this portfolio can reach, not
// the ESMA register: a market it does not know answers `undefined`.

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

const normalise = (market: string): string => market.trim().toUpperCase();

/** `true` or `false` for a market in the table; `undefined` when absent or unknown. */
export const euRegulatedMarket = (market: string | undefined): boolean | undefined => {
  if (market === undefined) {
    return undefined;
  }
  const key = normalise(market);
  if (EU.includes(key)) {
    return true;
  }
  // "NASDAQ GS", "NYSE American": the tiers of the two US exchanges.
  return NOT_EU.includes(key) || /^(NASDAQ|NYSE)\b/.test(key) ? false : undefined;
};
