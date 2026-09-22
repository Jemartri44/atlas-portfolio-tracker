// atlas tax <año> --boxes [--json] — the savings base laid out by box.
//
// What the user reads with Renta WEB open beside it, so the order is the order
// of the form and every figure carries the number and the **literal label** of
// its box, with the official document it was read in.
//
// A year with no checked mapping prints the same figures with no numbers at
// all, and says so: a box inherited from another year is a believable, wrong
// figure that the user types into a real return (prompt 010, decision (e)).

import type { BoxEntry, Money, TaxBoxes } from "@atlas/domain";
import { describeWarning } from "../output/messages.js";
import { table } from "../output/table.js";

/** A figure of the return: always two decimals, so a column reads as money. */
const cents = (money: Money | undefined): string => {
  if (money === undefined) {
    return "";
  }
  const [whole, fraction = ""] = money.amount.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

/** The blocks of the form, in its order, by the prefix of the concepts they hold. */
const BLOCKS: { title: string; matches: (concept: string) => boolean }[] = [
  {
    title: "Rendimientos del capital mobiliario (art. 25 LIRPF)",
    matches: (concept) => concept.startsWith("rcm."),
  },
  {
    title: "Instituciones de inversión colectiva",
    matches: (concept) => concept.startsWith("gp.iic."),
  },
  {
    title: "IIC del artículo 75.3.j): fondos y sociedades cotizadas",
    matches: (concept) => concept.startsWith("gp.etf."),
  },
  {
    title: "Acciones negociadas",
    matches: (concept) => concept.startsWith("gp.listed_shares."),
  },
  { title: "Monedas virtuales", matches: (concept) => concept.startsWith("gp.crypto.") },
  {
    title: "Otros elementos patrimoniales",
    matches: (concept) => concept.startsWith("gp.other."),
  },
  {
    title: "Ejercicios anteriores imputables a este",
    matches: (concept) => concept.startsWith("gp.prior_years."),
  },
  {
    title: "Integración y compensación",
    matches: (concept) =>
      concept.startsWith("gp.gains_total") ||
      concept.startsWith("gp.losses_total") ||
      concept.startsWith("gp.balance") ||
      concept.startsWith("offset.") ||
      concept.startsWith("pending."),
  },
  { title: "Base del ahorro", matches: (concept) => concept.startsWith("base.") },
  { title: "Anexo C.3: saldos pendientes", matches: (concept) => concept.startsWith("annex.") },
  {
    title: "Deducciones y pagos a cuenta",
    matches: (concept) => concept.startsWith("ddi.") || concept.startsWith("withholding."),
  },
];

/** What a figure is worth, or why it is not there. */
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
  const amount = cents(entry.amount_eur);
  return entry.form_eur === undefined
    ? amount
    : `${amount} (el formulario dará ${cents(entry.form_eur)})`;
};

/** Which operation a per-row field belongs to, by asset and date, never by an identifier. */
const rowOf = (entry: BoxEntry): string =>
  entry.row === undefined
    ? entry.origin_year === undefined
      ? ""
      : `de ${String(entry.origin_year)}`
    : `${entry.row.asset_id} ${entry.row.fiscal_date}`;

const blockText = (title: string, entries: readonly BoxEntry[]): string =>
  `\n${title}\n${table(
    ["casilla", "rótulo", "importe", "operación", "concepto"],
    entries.map((entry) => [
      entry.box ?? "—",
      entry.label ?? "(sin correspondencia comprobada)",
      amountText(entry),
      rowOf(entry),
      entry.concept,
    ]),
  )}`;

export const renderBoxes = (boxes: TaxBoxes): string => {
  const out: string[] = [
    `TU DECLARACIÓN POR CASILLAS — Renta ${boxes.year}. Núcleo y cubo agregados por contribuyente (constitución III).`,
    boxes.mapping === "checked"
      ? `Casillas de ${boxes.year} comprobadas el ${boxes.source?.checked_at ?? "?"} en ${boxes.source?.document ?? "?"}.`
      : `Las casillas de ${boxes.year} no están comprobadas en un formulario oficial: van los importes por conceptos, sin números. Nunca se usa la casilla de otro ejercicio.`,
  ];
  const placed = new Set<BoxEntry>();
  for (const block of BLOCKS) {
    const entries = boxes.entries.filter((entry) => block.matches(entry.concept));
    for (const entry of entries) {
      placed.add(entry);
    }
    if (entries.length > 0) {
      out.push(blockText(block.title, entries));
    }
  }
  // Nothing is ever dropped: a concept the blocks above do not name still gets
  // printed, because a figure of the return that no screen shows is the defect
  // this whole layer exists to avoid.
  const rest = boxes.entries.filter((entry) => !placed.has(entry));
  if (rest.length > 0) {
    out.push(blockText("Otros conceptos", rest));
  }
  out.push("\nAvisos", boxes.notes.map((note) => `- ${describeWarning(note)}`).join("\n"));
  return out.join("\n");
};
