// The income tax package: the boxes of one year as a CSV file to keep, to
// attach or to type from, with the detail of every lot behind each disposal
// and where each figure comes from.
//
// It is a **serialisation** of `TaxBoxes` and `TaxYearReport`, never a
// calculation: every amount is the one the screens show. Four kinds of row,
// told apart by the first column:
//
//   - `ejercicio`: one, first, saying which form the boxes were read in, or
//     that the year has none checked;
//   - `casilla`: one per `BoxEntry`, in the order of the form, with the box,
//     its literal label and the image of the BOE it was read in;
//   - `lote`: one per lot a disposal consumed, joined to its `casilla` rows by
//     `operacion`, with the acquisition at the root of its lineage and its ECB
//     rate as recorded (ADR-0013);
//   - `nota`: the warnings of the layout, which say what a figure is not.
//
// The words a person reads —the title of a block, why a box is partial, the
// sentence of a warning— belong to the interface that already says them on the
// screen (`PackageWords`); the domain passes codes when nobody gives words, so
// the file and the screen never word the same thing twice.
//
// The format is the one a Spanish spreadsheet opens without asking: `;` between
// fields, a decimal comma, UTF-8 with a byte order mark and CRLF. A text that a
// spreadsheet would run as a formula (`=`, `+`, `-`, `@` at the start: an asset
// name is typed by the user) is prefixed with an apostrophe.

import type { Money } from "../../money/money.js";
import type { Warning } from "../../projections/state.js";
import type { AssetId, LedgerEvent } from "../../schema/events.js";
import type { TaxOptions } from "../chain.js";
import type { Certainty } from "../criteria.js";
import type { TaxYearReport, TransmissionLine } from "../report.js";
import { taxYearWithChain } from "../year.js";
import { boxesOf } from "./boxes.js";
import { type BoxBlockId, blockOfConcept, conceptName } from "./concepts.js";
import type { BoxEntry, PartialReason, TaxBoxes } from "./report.js";

export const PACKAGE_COLUMNS = [
  "tipo",
  "apartado",
  "concepto",
  "casilla",
  "etiqueta",
  "ejercicio_origen",
  "fecha",
  "activo",
  "isin",
  "cuenta",
  "importe_eur",
  "texto",
  "certeza",
  "parcial",
  "criterios",
  "fuente",
  "operacion",
  "lote",
  "fecha_adquisicion",
  "cantidad",
  "coste_eur",
  "transmision_eur",
  "resultado_eur",
  "compra_origen",
  "fecha_compra_origen",
  "importe_compra_origen",
  "divisa_compra_origen",
  "tipo_bce",
  "fecha_tipo_bce",
] as const;

type Column = (typeof PACKAGE_COLUMNS)[number];
type Row = Partial<Record<Column, string>>;

const CERTAINTY: Record<Certainty, string> = {
  high: "alta",
  medium: "media",
  low: "baja",
  disputed: "en disputa",
};

/** Cents with a decimal comma: what Renta WEB and a Spanish spreadsheet read. */
const amount = (money: Money | undefined): string =>
  money === undefined ? "" : money.centsText().replace(".", ",");

/** A decimal that is not money (a quantity, a rate) keeps all its digits. */
const decimal = (text: string): string => text.replace(".", ",");

/** A user's text a spreadsheet would read as a formula is made inert. */
const inert = (text: string): string => (/^[=+\-@]/.test(text) ? `'${text}` : text);

const field = (text: string): string =>
  /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;

const csvLine = (row: Row): string =>
  PACKAGE_COLUMNS.map((column) => field(row[column] ?? "")).join(";");

/** What the interface says in words; every one of them is the screen's own. */
export interface PackageWords {
  block: (block: BoxBlockId) => string;
  partial: (reason: PartialReason) => string;
  note: (note: Warning) => string;
}

interface Names extends PackageWords {
  name: (asset: AssetId) => string;
  isin: (asset: AssetId) => string;
}

/** The codes themselves, for a caller with no words of its own. */
export const CODE_WORDS: PackageWords = {
  block: (block) => block,
  partial: (reason) => reason,
  note: (note) => note.message,
};

const entryRow = (entry: BoxEntry, names: Names): Row => ({
  tipo: "casilla",
  apartado: names.block(blockOfConcept(entry.concept)),
  concepto: conceptName(entry.concept),
  casilla: entry.box ?? "",
  etiqueta: entry.label ?? "",
  ejercicio_origen: entry.origin_year === undefined ? "" : String(entry.origin_year),
  fecha: entry.row?.fiscal_date ?? "",
  activo: entry.row === undefined ? "" : inert(names.name(entry.row.asset_id)),
  isin: entry.row === undefined ? "" : names.isin(entry.row.asset_id),
  cuenta: entry.row?.account_id ?? "",
  importe_eur: amount(entry.amount_eur),
  texto: entry.missing === true ? "no consta en el libro" : inert(entry.text ?? ""),
  certeza: entry.certainty === undefined ? "" : CERTAINTY[entry.certainty],
  parcial: entry.partial === undefined ? "" : names.partial(entry.partial),
  criterios: entry.criteria.join(" "),
  fuente: entry.source?.url ?? "",
  operacion: entry.row?.event_id ?? "",
});

const lotRows = (line: TransmissionLine, names: Names): Row[] =>
  line.lots.map((lot) => ({
    tipo: "lote",
    fecha: line.fiscal_date,
    activo: inert(names.name(line.asset_id)),
    isin: names.isin(line.asset_id),
    cuenta: line.account_id,
    criterios: line.criteria.join(" "),
    operacion: line.event_id,
    lote: lot.lot_id,
    fecha_adquisicion: lot.acquisition_date,
    cantidad: decimal(lot.quantity.toString()),
    coste_eur: amount(lot.cost_eur),
    transmision_eur: amount(lot.proceeds_eur),
    resultado_eur: amount(lot.gain_eur),
    compra_origen: lot.root.event_id,
    fecha_compra_origen: lot.root.acquisition_date,
    importe_compra_origen: decimal(lot.root.cost.amount.amount.toString()),
    divisa_compra_origen: lot.root.cost.amount.currency,
    tipo_bce: decimal(lot.root.cost.fx_rate),
    fecha_tipo_bce: lot.root.cost.fx_rate_date,
  }));

const headerRow = (boxes: TaxBoxes): Row => ({
  tipo: "ejercicio",
  ejercicio_origen: String(boxes.year),
  fecha: boxes.today,
  texto:
    boxes.source === undefined
      ? "Sin casillas comprobadas para este ejercicio: los importes valen, los números de casilla no constan"
      : `Casillas leídas en ${boxes.source.document} el ${boxes.source.checked_at}. Total fiscal: núcleo y cubo juntos`,
});

/** The CSV of `boxes` and `report`, which must be of the same year and reading. */
export const packageCsv = (boxes: TaxBoxes, report: TaxYearReport, names: Names): string => {
  const lines = [...report.capital_gains.lines, ...report.movable_capital.transmissions];
  const rows: Row[] = [
    headerRow(boxes),
    ...boxes.entries.map((entry) => entryRow(entry, names)),
    ...lines.flatMap((line) => lotRows(line, names)),
    ...boxes.notes.map((note) => ({
      tipo: "nota",
      concepto: note.code,
      texto: inert(names.note(note)),
      operacion: note.event_id,
    })),
  ];
  return `﻿${[PACKAGE_COLUMNS.join(";"), ...rows.map(csvLine)].join("\r\n")}\r\n`;
};

/** The package of `year` straight from the ledger: the same reading the fiscal screen shows. */
export const rentaPackage = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
  words: PackageWords = CODE_WORDS,
): string => {
  const { report, chain } = taxYearWithChain(events, year, options);
  const assets = chain.state.assets;
  return packageCsv(boxesOf(report, chain), report, {
    ...words,
    // A disposal is always of an asset of the catalogue; an exchange difference names its currency.
    name: (asset) => assets.get(asset)?.name ?? asset,
    isin: (asset) => assets.get(asset)?.isin ?? "",
  });
};
