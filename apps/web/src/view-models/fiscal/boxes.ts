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
import type { BoxBlockId, BoxEntry, TaxBoxes } from "@atlas/domain/fiscal";
import { BOX_BLOCKS, blockOfConcept } from "@atlas/domain/fiscal";
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

/** Why a box is not the whole of what the form will hold, said to the user. */
export const PARTIAL_TEXTS: Record<string, string> = {
  reductions_unknown:
    "falta restar las reducciones que no están en tus datos, así que esta casilla puede salir menor",
  treaty_limit_only:
    "solo se calcula el primer límite del convenio; el segundo depende de tu tipo medio de gravamen",
  ledger_withholdings_only: "solo incluye las retenciones que has registrado",
};

export interface BoxRowView {
  key: string;
  /** The number of the box, when the year has a checked mapping. */
  box?: string;
  /** Its label, word for word from the form. */
  label?: string;
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

const rowView = (entry: BoxEntry, index: number, names: NameIndex): BoxRowView => {
  const operation = operationOf(entry, names);
  return {
    key: `${entry.concept}:${index}`,
    ...(entry.box === undefined ? {} : { box: entry.box }),
    ...(entry.label === undefined ? {} : { label: entry.label }),
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
  blocks: BOX_BLOCKS.map((block) => ({
    key: block,
    title: BLOCK_TITLES[block],
    rows: boxes.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => blockOfConcept(entry.concept) === block)
      .map(({ entry, index }) => rowView(entry, index, names)),
  })).filter((block) => block.rows.length > 0),
});
