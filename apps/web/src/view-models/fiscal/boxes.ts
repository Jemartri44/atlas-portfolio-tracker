// The return laid out by box, ready to paint beside Renta WEB.
//
// The structure is the domain's (`blockOfConcept`), so the console and the web
// group the figures the same way; what the web adds is the Spanish of each
// block and of what a figure is when it is not an amount: a datum the ledger
// does not hold, a box the engine cannot compute whole, a cent the form will
// round the other way.
//
// A year with no checked mapping keeps every figure and loses every number,
// and says so. Never the box of another year (prompt 010, decision (e)).

import type { Money } from "@atlas/domain";
import type { BoxBlockId, BoxEntry, PartialReason, TaxBoxes } from "@atlas/domain/fiscal";
import { BOX_BLOCKS, blockOfConcept, conceptName } from "@atlas/domain/fiscal";
import { formatDate } from "../../format/date.js";
import type { NameIndex } from "../../format/names.js";
import { displayName } from "../../format/names.js";

export const BLOCK_TITLES: Record<BoxBlockId, string> = {
  rcm: "Rendimientos del capital mobiliario",
  iic: "Fondos de inversión",
  etf: "Fondos y sociedades cotizados",
  listed_shares: "Acciones",
  crypto: "Monedas virtuales",
  other: "Otros elementos patrimoniales",
  prior_years: "De ejercicios anteriores",
  offsetting: "Integración y compensación",
  base: "Base del ahorro",
  annex: "Saldos pendientes de compensar",
  deductions: "Deducciones y pagos a cuenta",
};

/**
 * Why a box is not the whole of what the form will hold, said to the user.
 *
 * Keyed by `PartialReason` and not by `string`: with an open key a reason the
 * domain adds tomorrow resolves to `undefined` here, the row loses its caveat
 * and the box is painted as if the engine had computed it whole. That is the
 * quietest way this screen could lie.
 */
export const PARTIAL_TEXTS: Record<PartialReason, string> = {
  reductions_unknown:
    "falta restar las reducciones que no están en tus datos, así que esta casilla puede salir menor",
  treaty_limit_only:
    "solo se calcula el primer límite del convenio; el segundo depende de tu tipo medio de gravamen",
  ledger_withholdings_only: "solo incluye las retenciones que has registrado",
};

export interface BoxRowView {
  key: string;
  /**
   * What the figure **is**, from the domain. Always present, and the only
   * thing that says which number is the transmission value and which the
   * acquisition one in a year with no checked table — which is every year but
   * 2025, and the user's first real return is 2026.
   */
  name: string;
  /** The number of the box, when the year has a checked mapping. */
  box?: string;
  /** Its label, word for word from the form. */
  label?: string;
  /**
   * Where the number and the label were read, and how firm that reading is.
   * A box that carries a number the user types into a real return has to say
   * where it comes from; a number with no source behind it is a number
   * somebody remembers.
   */
  checked?: string;
  amount_eur?: Money;
  /** What the form will compute, when it differs by a cent from the engine. */
  form_eur?: Money;
  /** A value that is not an amount: the name of a security. */
  text?: string;
  /** The ledger does not hold it: said, never invented. */
  missing: boolean;
  /** The engine cannot compute the whole box. */
  partial?: string;
  /** Which operation the row belongs to: the asset and its fiscal date. */
  operation?: string;
}

export interface BoxBlockView {
  key: BoxBlockId;
  title: string;
  rows: BoxRowView[];
  /**
   * The year has a checked table and some of these rows still have no box in
   * it. Said **once for the block** and not on every row: repeated on each of
   * forty-odd rows it stopped being a caveat and became the wallpaper.
   */
  some_without_box: boolean;
  /**
   * The official images the boxes of this block were read in, once each. The
   * URL is shown as text, not as a link: it is a **citation**, which is also
   * what `check-bundle.mjs` says when it lets `boe.es` through the rule that
   * forbids a foreign origin — the page never asks the BOE for anything.
   */
  sources: { key: string; page: string; url: string }[];
}

export interface BoxesView {
  year: number;
  /** The year has a mapping read in an official document. */
  checked: boolean;
  source?: { document: string; url: string; checked_at: string };
  blocks: BoxBlockView[];
}

const operationOf = (entry: BoxEntry, names: NameIndex): string | undefined => {
  if (entry.row !== undefined) {
    return `${displayName(names, entry.row.asset_id)} · ${formatDate(entry.row.fiscal_date)}`;
  }
  return entry.origin_year === undefined ? undefined : `De ${entry.origin_year}`;
};

/** "Comprobada en la pág. 14 el 23/09/2026", and whether that reading is firm. */
const checkedText = (entry: BoxEntry): string | undefined => {
  if (entry.source === undefined || entry.checked_at === undefined) {
    return undefined;
  }
  const where = `Comprobada en la pág. ${entry.source.page} el ${formatDate(entry.checked_at)}`;
  return entry.certainty === "high" ? where : `${where}, sin confirmar`;
};

const rowView = (entry: BoxEntry, index: number, names: NameIndex): BoxRowView => {
  const operation = operationOf(entry, names);
  const checked = checkedText(entry);
  return {
    key: `${entry.concept}:${index}`,
    name: conceptName(entry.concept),
    ...(entry.box === undefined ? {} : { box: entry.box }),
    ...(entry.label === undefined ? {} : { label: entry.label }),
    ...(checked === undefined ? {} : { checked }),
    ...(entry.amount_eur === undefined ? {} : { amount_eur: entry.amount_eur }),
    ...(entry.form_eur === undefined ? {} : { form_eur: entry.form_eur }),
    ...(entry.text === undefined ? {} : { text: entry.text }),
    missing: entry.missing === true,
    ...(entry.partial === undefined ? {} : { partial: PARTIAL_TEXTS[entry.partial] }),
    ...(operation === undefined ? {} : { operation }),
  };
};

export const boxesView = (boxes: TaxBoxes, names: NameIndex): BoxesView => ({
  year: boxes.year,
  checked: boxes.mapping === "checked",
  ...(boxes.source === undefined ? {} : { source: boxes.source }),
  blocks: BOX_BLOCKS.map((block) => {
    const entries = boxes.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => blockOfConcept(entry.concept) === block);
    const sources = new Map<string, { key: string; page: string; url: string }>();
    for (const { entry } of entries) {
      if (entry.source !== undefined) {
        sources.set(entry.source.url, {
          key: entry.source.url,
          page: entry.source.page,
          url: entry.source.url,
        });
      }
    }
    return {
      key: block,
      title: BLOCK_TITLES[block],
      rows: entries.map(({ entry, index }) => rowView(entry, index, names)),
      some_without_box:
        boxes.mapping === "checked" && entries.some(({ entry }) => entry.box === undefined),
      sources: [...sources.values()],
    };
  }).filter((block) => block.rows.length > 0),
});
