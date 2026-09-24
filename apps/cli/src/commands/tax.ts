// atlas tax <año> [--lots] [--json] — the savings base of a tax year (feature 009).
//
// The CLI only formats: every figure, every criterion and every note comes from
// `taxYear` in the domain (decision (h) of prompt 006, §2 bis of prompt 009).

import { todayInMadrid } from "@atlas/domain";
import type {
  CriterionId,
  CriterionStake,
  IncomeLine,
  TaxYearReport,
  TransmissionLine,
} from "@atlas/domain/fiscal";
import {
  CRITERION_IDS,
  FISCAL_CRITERIA,
  isDoubtful,
  taxBoxes,
  taxBoxesJson,
  taxReportJson,
  taxYear,
} from "@atlas/domain/fiscal";
import { assertKnownFlags, booleanFlag, type Flags, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { CRITERION_LABELS } from "../output/criteria.js";
import { eur } from "../output/format.js";
import { describeWarning } from "../output/messages.js";
import { table } from "../output/table.js";
import { rateFindingsOf } from "./rates.js";
import { render } from "./shared.js";
import { renderBoxes } from "./tax-boxes.js";

const USAGE = "uso: atlas tax <año> [--lots] [--boxes] [--json]";

/** A figure of the return: always two decimals, so a column reads as money. */
const CERTAINTY: Record<string, string> = {
  high: "alta",
  medium: "media",
  low: "baja",
  disputed: "en disputa",
};

const RISK: Record<string, string> = {
  conservative: "conservador",
  aggressive: "agresivo",
  both: "ambas",
  neutral: "neutro",
  none: "ninguna",
};

const criteriaText = (ids: readonly CriterionId[]): string =>
  ids.map((id) => (isDoubtful(id) ? `${id}*` : id)).join(" ");

const CATEGORY: Record<string, string> = {
  capital_gain: "ganancias y pérdidas patrimoniales",
  movable_capital: "rendimientos del capital mobiliario",
};

const transmissionTable = (lines: readonly TransmissionLine[]): string =>
  table(
    [
      "fecha fiscal",
      "evento",
      "operación",
      "activo",
      "libro",
      "cuenta",
      "cantidad",
      "transmisión",
      "tipo BCE",
      "transmisión EUR",
      "coste EUR",
      "propio",
      "liberado",
      "diferido",
      "computable",
      "criterios",
    ],
    lines.map((line) => [
      line.fiscal_date,
      line.event_id,
      line.corporate_action_kind === undefined
        ? line.event_type
        : `${line.event_type}:${line.corporate_action_kind}`,
      line.asset_id,
      line.book === "core" ? "núcleo" : "cubo",
      line.account_id,
      line.quantity.toString(),
      `${line.proceeds.amount.amount.toString()} ${line.proceeds.amount.currency}`,
      `${line.proceeds.fx_rate} (${line.proceeds.fx_rate_date})`,
      eur(line.proceeds.eur),
      eur(line.cost_eur),
      eur(line.own_eur),
      eur(line.released_eur),
      eur(line.deferred_eur),
      `${eur(line.computable_eur_rounded)}${line.provisional_until === undefined ? "" : " (provisional)"}`,
      criteriaText(line.criteria),
    ]),
  );

const lotTable = (lines: readonly TransmissionLine[]): string =>
  table(
    [
      "evento",
      "lote",
      "cantidad",
      "coste EUR",
      "transmisión EUR",
      "resultado",
      "adquisición",
      "linaje",
      "origen",
    ],
    lines.flatMap((line) =>
      line.lots.map((lot) => [
        line.event_id,
        lot.lot_id,
        lot.quantity.toString(),
        eur(lot.cost_eur),
        eur(lot.proceeds_eur),
        eur(lot.gain_eur),
        lot.acquisition_date,
        lot.lineage.map((step) => `${step.event_type} ${step.lot_id}`).join(" ← "),
        `${lot.root.event_type} ${lot.root.event_id}: ${lot.root.cost.amount.amount.toString()} ${lot.root.cost.amount.currency} al ${lot.root.cost.fx_rate} (${lot.root.cost.fx_rate_date})`,
      ]),
    ),
  );

const incomeTable = (lines: readonly IncomeLine[]): string =>
  table(
    [
      "fecha",
      "evento",
      "activo",
      "bruto",
      "tipo BCE",
      "bruto EUR",
      "ret. origen",
      "ret. España",
      "país",
      "criterios",
    ],
    lines.map((line) => [
      line.fiscal_date,
      line.event_id,
      line.asset_id ?? "",
      `${line.gross.amount.amount.toString()} ${line.gross.amount.currency}`,
      `${line.gross.fx_rate} (${line.gross.fx_rate_date})`,
      eur(line.gross_eur_rounded),
      // In the currency of the operation, like the gross above it and with
      // every decimal it was recorded with (ADR-0013): a withholding is not a
      // euro figure and the column used to print it with no currency at all.
      `${line.withholding_origin.amount.toString()} ${line.withholding_origin.currency}`,
      `${line.withholding_spain.amount.toString()} ${line.withholding_spain.currency}`,
      line.source_country ?? "",
      criteriaText(line.criteria),
    ]),
  );

const REASONS: Record<NonNullable<CriterionStake["reason"]>, (item: CriterionStake) => string> = {
  invalid_under_alternative: (item) =>
    `con la otra lectura ${String(item.invalid_count)} eventos serían inválidos`,
  unsupported_under_alternative: () =>
    "con la otra lectura el cálculo tendría que empezar en un ejercicio anterior al primero que este motor sabe calcular",
  lot_in_other_currency: () => "algún lote se compró en otra divisa",
  regime_not_recorded: () =>
    "sin régimen de neutralidad sería una permuta sujeta, y su valor no está en el libro",
  no_carrier_left: () =>
    "la otra lectura no tiene dónde aplazar: no queda en cartera ningún título de ese valor",
};

const stake = (item: CriterionStake): string => {
  const reason = item.reason === undefined ? "" : ` (${REASONS[item.reason](item)})`;
  if (item.measure === "not_quantifiable") {
    return `no cuantificable${reason}`;
  }
  if (item.measure === "exposure") {
    return `exposición ${eur(item.exposure_eur)}${reason}`;
  }
  const parts = [`base ${eur(item.base_difference_eur)}`];
  if (item.pending_difference_eur !== undefined && !item.pending_difference_eur.isZero()) {
    parts.push(`pendiente ${eur(item.pending_difference_eur)}`);
  }
  if (item.deferred_difference_eur !== undefined && !item.deferred_difference_eur.isZero()) {
    parts.push(`diferido ${eur(item.deferred_difference_eur)}`);
  }
  return `diferencia: ${parts.join(", ")}`;
};

/** The same table for the two lists of criteria: what is doubtful and what is settled. */
const stakeTable = (items: readonly CriterionStake[]): string =>
  table(
    ["criterio", "certeza", "riesgo documentado", "dinero en juego", "dirección", "operaciones"],
    items.map((item) => [
      `${item.criterion} ${CRITERION_LABELS[item.criterion]}`,
      CERTAINTY[item.certainty] as string,
      RISK[item.documented_risk] as string,
      stake(item),
      RISK[item.direction] as string,
      [
        ...item.event_ids,
        ...(item.markets === undefined ? [] : [`mercados: ${item.markets.join(", ")}`]),
      ].join(" "),
    ]),
  );

const section = (title: string, body: string): string => `\n${title}\n${body}`;

const CAUSE: Record<string, string> = {
  at_filing: "lo que cambiaste al presentar",
  engine: "cambio del motor",
  settings: "cambio de configuración",
  later_events: "eventos registrados después",
};

/**
 * What was filed for this year, next to what the ledger says today (ADR-0020).
 *
 * It is printed **always**, with its own sentence when there is no filing: a
 * section that appears and disappears would renumber the ones after it, and
 * the numbering of this output is a contract (README).
 */
const filingText = (report: TaxYearReport): string => {
  const filing = report.filing;
  if (filing === undefined) {
    return "No consta ninguna Renta presentada de este ejercicio. Si la presentaste, regístrala con `atlas filed renta <año>`: es lo que cierra el ejercicio y ancla el arrastre.";
  }
  const lines = [
    `Declarado el ${filing.filed_at} (justificante ${filing.receipt_reference}).${filing.chain.length > 1 ? ` Cadena de ${filing.chain.length} presentaciones; en vigor la última.` : ""}`,
    filing.fingerprint_ok
      ? ""
      : "La huella del libro no cuadra con los eventos anteriores a la presentación: no se puede reproducir el cálculo de aquel día, así que no se reparten las causas. Ejecuta `atlas check --deep`.",
    table(
      ["cifra", "declarado", "calculado entonces", "hoy", "por qué difiere"],
      filing.figures.map((figure) => [
        figure.figure,
        eur(figure.declared),
        eur(figure.computed_then),
        eur(figure.now),
        figure.causes === undefined
          ? ""
          : Object.entries(figure.causes)
              .filter(([, amount]) => !amount.isZero())
              .map(([cause, amount]) => `${CAUSE[cause] ?? cause} ${eur(amount)}`)
              .join(" · "),
      ]),
    ),
  ];
  return lines.filter((line) => line !== "").join("\n");
};

export const renderTaxReport = (report: TaxYearReport, withLots: boolean): string => {
  const out: string[] = [
    `TOTAL FISCAL ${report.year} — núcleo y cubo agregados por contribuyente (constitución III).`,
    "Esto es la BASE del ahorro, no la cuota ni lo que se paga.",
    `Configuración aplicada: ${report.settings.origin}. Fecha de consulta: ${report.today}. Criterios con * son dudosos (leyenda al final).`,
  ];
  const gains = report.capital_gains;
  out.push(
    section(
      "1. Ganancias y pérdidas patrimoniales (art. 33 LIRPF)",
      `${transmissionTable(gains.lines)}\nGanancias ${eur(gains.gains_eur)} · Pérdidas ${eur(gains.losses_eur)} · Saldo ${eur(gains.balance_eur)}${gains.foreign_releases_eur.isZero() ? "" : ` (incluye ${eur(gains.foreign_releases_eur)} liberados de pérdidas de esta categoría)`}`,
    ),
  );
  if (withLots) {
    out.push(
      section(
        "   Lotes consumidos y su linaje",
        lotTable([...gains.lines, ...report.movable_capital.transmissions]),
      ),
    );
  }
  const movable = report.movable_capital;
  const movableParts = [
    `Dividendos:\n${incomeTable(movable.dividends)}`,
    `Intereses:\n${incomeTable(movable.interest)}`,
  ];
  if (movable.transmissions.length > 0) {
    movableParts.push(`Transmisiones (art. 25.2):\n${transmissionTable(movable.transmissions)}`);
  }
  movableParts.push(
    `Gastos de administración y depósito (art. 26.1.a):\n${table(
      ["fecha", "evento", "tipo", "importe", "EUR", "criterios"],
      movable.expenses.map((line) => [
        line.fiscal_date,
        line.event_id,
        line.fee_kind,
        `${line.amount.amount.amount.toString()} ${line.amount.amount.currency}`,
        eur(line.amount_eur_rounded),
        criteriaText(line.criteria),
      ]),
    )}`,
    `Saldo ${eur(movable.balance_eur)}`,
  );
  out.push(
    section("2. Rendimientos del capital mobiliario (art. 25 LIRPF)", movableParts.join("\n")),
  );
  const wash = report.wash_sale;
  out.push(
    section(
      "3. Regla de recompra",
      [
        `Diferidas en ${report.year}:`,
        table(
          ["evento", "activo", "fecha", "diferido", "unidades", "ventana", "adquisiciones"],
          wash.deferred.map((line) => [
            line.event_id,
            line.asset_id,
            line.fiscal_date,
            eur(line.amount_eur_rounded),
            `${line.units.toString()} de ${line.sold.toString()}`,
            `${line.window} [${line.window_start} … ${line.window_end}]`,
            line.acquisitions
              .map(
                (a) =>
                  `${a.event_id} ${a.fiscal_date} ${a.units.toString()}${a.via_transfer ? " (traspaso)" : ""}`,
              )
              .join("; "),
          ]),
        ),
        `Liberadas en ${report.year}:`,
        table(
          ["evento", "pérdida de origen", "importe", "viajó"],
          wash.released.map((line) => [
            line.event_id,
            `${line.origin_event_id} (${line.origin_fiscal_date})`,
            eur(line.amount_eur),
            line.travelled ? "sí" : "no",
          ]),
        ),
        `Pendientes a 31/12/${report.year}:`,
        table(
          ["pérdida de origen", "lote", "activo", "importe", "viajó"],
          wash.pending.map((line) => [
            line.origin_event_id,
            line.lot_id ?? `espera la recompra ${line.awaiting_event_id ?? ""}`,
            line.asset_id,
            eur(line.amount_eur),
            line.travelled ? "sí" : "no",
          ]),
        ),
      ].join("\n"),
    ),
  );
  const c = report.compensation;
  out.push(
    section(
      "4. Compensación (art. 49 LIRPF)",
      [
        `Límite conjunto del ${c.limit_pct} %: contra ganancias ${eur(c.limit_eur.capital_gain)}, contra rendimientos ${eur(c.limit_eur.movable_capital)}.`,
        table(
          ["fase", "compensa", "ejercicio de origen", "contra", "importe", "con límite"],
          c.steps.map((step) => [
            String(step.phase),
            CATEGORY[step.from] as string,
            String(step.origin_year),
            CATEGORY[step.against] as string,
            eur(step.amount_eur),
            step.limited ? "sí" : "no",
          ]),
        ),
      ].join("\n"),
    ),
  );
  out.push(
    section(
      "5. Saldos negativos pendientes",
      [
        table(
          ["ejercicio de origen", "categoría", "importe", "último ejercicio"],
          c.pending.map((p) => [
            String(p.origin_year),
            CATEGORY[p.category] as string,
            eur(p.amount_eur),
            String(p.expires_after),
          ]),
        ),
        ...c.expired.map(
          (p) =>
            `CADUCA al cierre de ${report.year}: ${eur(p.amount_eur)} de ${p.origin_year} (${CATEGORY[p.category]}).`,
        ),
        // One line per substitution, oldest first: with two returns filed the
        // report used to carry only the last, and the text said "anclado en"
        // as if there had been one (feature 011, block 6).
        ...report.anchors.map((anchor) =>
          anchor.before_ledger === true
            ? `Anclado en lo declarado en ${anchor.year}, anterior a tus datos: ${anchor.declared.map((p) => `${p.origin_year} ${eur(p.amount_eur)}`).join(", ") || "nada"}. Vienen de lo declarado, no de un cálculo.`
            : `Anclado en lo declarado en ${anchor.year}: calculado ${anchor.computed.map((p) => `${p.origin_year} ${eur(p.amount_eur)}`).join(", ") || "nada"}; declarado ${anchor.declared.map((p) => `${p.origin_year} ${eur(p.amount_eur)}`).join(", ") || "nada"}.`,
        ),
      ].join("\n"),
    ),
  );
  out.push(
    `\nBASE IMPONIBLE DEL AHORRO ${report.year}: ${eur(report.base_eur)} EUR (base, no cuota)`,
  );
  out.push(section("6. Lo declarado en este ejercicio", filingText(report)));
  out.push(
    section(
      "7. Retenciones a cuenta (se restan de la cuota, que este motor no calcula)",
      `${table(
        ["fecha", "evento", "origen", "importe", "EUR"],
        report.withholdings.lines.map((line) => [
          line.fiscal_date,
          line.event_id,
          line.source,
          `${line.amount.amount.amount.toString()} ${line.amount.amount.currency}`,
          eur(line.amount_eur_rounded),
        ]),
      )}\nTotal ${eur(report.withholdings.total_eur)}`,
    ),
  );
  out.push(
    section(
      "8. Doble imposición internacional (#16, solo el primer límite)",
      `${table(
        [
          "evento",
          "país",
          "bruto EUR",
          "impuesto extranjero",
          "convenio %",
          "deducible",
          "no deducible",
        ],
        report.double_taxation.lines.map((line) => [
          line.event_id,
          line.source_country ?? "?",
          eur(line.gross_eur),
          eur(line.foreign_tax_eur),
          line.treaty_pct ?? "—",
          eur(line.deductible_eur),
          eur(line.not_deductible_eur),
        ]),
      )}\nDeducible ${eur(report.double_taxation.deductible_eur)} · No deducible ${eur(report.double_taxation.not_deductible_eur)}`,
    ),
  );
  out.push(
    section(
      "9. Criterios dudosos: qué hay en juego si el criterio está mal",
      stakeTable(report.doubtful),
    ),
  );
  out.push(
    section(
      "10. Criterios firmes: lo que moverían leídos al revés",
      // "Checked and it moves nothing" is information, and saying it is the
      // same argument that split this list from the doubtful one instead of
      // filtering it. With nothing to show, a table prints its headings and a
      // separator and no rows: orphan headings say less than a sentence, and
      // the screen says it too (ADR-0024).
      report.settled.length === 0
        ? "Ninguno de tus criterios firmes movería nada leído al revés. Se ha comprobado; no es que no se haya mirado."
        : `${stakeTable(report.settled)}\nLa lectura de estos no está en duda; la cifra dice qué habría detrás si lo estuviera.`,
    ),
  );
  out.push(
    section(
      "11. Lo que este motor no calcula, y avisos",
      report.notes.map((note) => `- ${describeWarning(note)}`).join("\n"),
    ),
  );
  if (report.settings_diff !== undefined) {
    const diff = report.settings_diff;
    out.push(
      section(
        `12. Diferencias con la configuración anterior (${diff.previous_origin} → ${diff.current_origin})`,
        diff.invalid_before !== undefined
          ? `La configuración anterior deja ${diff.invalid_before} eventos inválidos: no hay cifra con la que comparar.`
          : `Base antes ${eur(diff.base_before_eur)} · ahora ${eur(diff.base_after_eur)}\n${
              diff.changes.length === 0
                ? "Ninguna operación cambia."
                : table(
                    ["evento", "cambio", "antes", "ahora"],
                    diff.changes.map((change) => [
                      change.event_id,
                      change.what,
                      change.before ?? "",
                      change.after ?? "",
                    ]),
                  )
            }`,
      ),
    );
  }
  const used = new Set<CriterionId>([
    ...report.capital_gains.lines.flatMap((line) => line.criteria),
    ...report.movable_capital.transmissions.flatMap((line) => line.criteria),
    ...report.doubtful.map((item) => item.criterion),
    ...report.settled.map((item) => item.criterion),
  ]);
  out.push(
    section(
      "Leyenda de criterios (docs/fiscal-questions.md)",
      table(
        ["criterio", "qué dice", "certeza", "riesgo"],
        CRITERION_IDS.filter((id) => used.has(id)).map((id) => [
          `${id}${isDoubtful(id) ? "*" : ""}`,
          CRITERION_LABELS[id],
          CERTAINTY[FISCAL_CRITERIA[id].certainty] as string,
          RISK[FISCAL_CRITERIA[id].risk] as string,
        ]),
      ),
    ),
  );
  return out.join("\n");
};

export const taxCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["lots", "boxes", ...GLOBAL_FLAGS]);
  const year = Number(positionals[1]);
  if (positionals[1] === undefined || !Number.isInteger(year)) {
    throw new UsageError(USAGE);
  }
  const { events } = await ctx.deps.store.load();
  const today = todayInMadrid(ctx.deps.clock);
  // The findings of the ECB check note the lines that depend on them; they
  // move no figure (ADR-0029, point 8).
  const options = { today, rateFindings: await rateFindingsOf(ctx) };
  if (booleanFlag(flags, "boxes")) {
    const boxes = taxBoxes(events, year, options);
    render(ctx, taxBoxesJson(boxes), renderBoxes(boxes));
    return 0;
  }
  const report = taxYear(events, year, options);
  render(ctx, taxReportJson(report), renderTaxReport(report, booleanFlag(flags, "lots")));
  return 0;
};
