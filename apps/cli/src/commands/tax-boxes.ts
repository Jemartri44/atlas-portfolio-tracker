// atlas tax <año> --boxes [--json] — the savings base laid out by box.
//
// What the user reads with Renta WEB open beside it, so the order is the order
// of the form and every figure carries the number and the **literal label** of
// its box, with the official document it was read in.
//
// A year with no checked mapping prints the same figures with no numbers at
// all, and says so: a box inherited from another year is a believable, wrong
// figure that the user types into a real return (prompt 010, decision (e)).

import type { BoxBlockId, BoxEntry, TaxBoxes } from "@atlas/domain/fiscal";
import { BOX_BLOCKS, blockOfConcept, conceptName } from "@atlas/domain/fiscal";
import { eur } from "../output/format.js";
import { describeWarning } from "../output/messages.js";
import { table } from "../output/table.js";

/**
 * What each block of the form is called. **Which** concept goes in which block
 * is decided by the domain (`blockOfConcept`): it is the structure of the
 * Modelo 100, and the console and the web have to group it the same way or the
 * two outputs stop being comparable.
 */
const BLOCK_TITLES: Record<BoxBlockId, string> = {
  rcm: "Rendimientos del capital mobiliario (art. 25 LIRPF)",
  iic: "Instituciones de inversión colectiva",
  etf: "IIC del artículo 75.3.j): fondos y sociedades cotizadas",
  listed_shares: "Acciones negociadas",
  crypto: "Monedas virtuales",
  other: "Otros elementos patrimoniales",
  prior_years: "Ejercicios anteriores imputables a este",
  offsetting: "Integración y compensación",
  base: "Base del ahorro",
  annex: "Anexo C.3: saldos pendientes",
  deductions: "Deducciones y pagos a cuenta",
};

/**
 * What a figure is worth, or why it is not there.
 *
 * A box the engine cannot compute **whole** says so even when it does carry an
 * amount: it used to say it only when the amount was missing altogether, so a
 * partial figure with a number beside it read as the amount of the box —
 * exactly what the prompt forbids ("nunca como el importe de la casilla"). The
 * web already said it; a caveat about a fiscal figure that only one of the two
 * interfaces makes is a caveat the user meets by chance.
 */
const amountText = (entry: BoxEntry): string => {
  if (entry.missing === true) {
    return "falta en tus datos";
  }
  if (entry.text !== undefined) {
    return entry.text;
  }
  if (entry.amount_eur === undefined) {
    return entry.partial === undefined ? "" : "no se calcula entero";
  }
  const amount = eur(entry.amount_eur);
  const withForm =
    entry.form_eur === undefined ? amount : `${amount} (el formulario dará ${eur(entry.form_eur)})`;
  return entry.partial === undefined ? withForm : `${withForm} — no se calcula entero`;
};

/** Which operation a per-row field belongs to, by asset and date, never by an identifier. */
const rowOf = (entry: BoxEntry): string =>
  entry.row === undefined
    ? entry.origin_year === undefined
      ? ""
      : `de ${String(entry.origin_year)}`
    : `${entry.row.asset_id} ${entry.row.fiscal_date}`;

/**
 * The columns are "what it is" first and the literal label of the form second,
 * because most years have no checked table —2025 is the only one that has one—
 * and in those years the second column is empty. The raw `ConceptId` is gone:
 * `gp.listed_shares.transmission` is a key of the code, not something a person
 * reads beside Renta WEB (the same reason `atlas tax` prints the name of a
 * criterion and not its number).
 */
const blockText = (title: string, entries: readonly BoxEntry[]): string =>
  `\n${title}\n${table(
    ["casilla", "concepto", "rótulo del formulario", "importe", "operación"],
    entries.map((entry) => [
      entry.box ?? "—",
      conceptName(entry.concept),
      entry.label ?? "—",
      amountText(entry),
      rowOf(entry),
    ]),
  )}`;

export const renderBoxes = (boxes: TaxBoxes): string => {
  const out: string[] = [
    `TU DECLARACIÓN POR CASILLAS — Renta ${boxes.year}. Núcleo y cubo agregados por contribuyente (constitución III).`,
    boxes.mapping === "checked"
      ? `Casillas de ${boxes.year} comprobadas el ${boxes.source?.checked_at ?? "?"} en ${boxes.source?.document ?? "?"}.`
      : `Las casillas de ${boxes.year} no están comprobadas en un formulario oficial: van los importes por conceptos, sin números. Nunca se usa la casilla de otro ejercicio.`,
  ];
  for (const block of BOX_BLOCKS) {
    const entries = boxes.entries.filter((entry) => blockOfConcept(entry.concept) === block);
    if (entries.length > 0) {
      out.push(blockText(BLOCK_TITLES[block], entries));
    }
  }
  out.push("\nAvisos", boxes.notes.map((note) => `- ${describeWarning(note)}`).join("\n"));
  return out.join("\n");
};
